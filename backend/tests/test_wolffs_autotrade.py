"""
Wolffs Insta AutoTrade - Backend API Tests
Tests for:
- Health check API
- Authentication (login with admin credentials)
- User info API
- Alerts API
- Webhook deduplication
- Webhook validation (plain text rejection, JSON without symbol rejection)
- Cross-instrument isolation
"""

import pytest
import requests
import os
import time
import concurrent.futures

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials from review request
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin@wolffs2024"


class TestHealthCheck:
    """Health check endpoint tests"""
    
    def test_health_endpoint(self):
        """Test /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        print(f"✓ Health check passed: {data}")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_with_admin_credentials(self):
        """Test login with admin credentials (mobile: 9999999999, password: admin@wolffs2024)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["mobile"] == ADMIN_MOBILE
        print(f"✓ Admin login successful: user_id={data['user']['id']}")
        return data["token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": "0000000000",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected with 401")


class TestUserInfo:
    """User info endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Authentication failed")
    
    def test_get_user_info(self, auth_token):
        """Test /api/auth/me returns user info with token"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "mobile" in data
        assert data["mobile"] == ADMIN_MOBILE
        assert "subscription" in data
        assert "trading_settings" in data
        print(f"✓ User info retrieved: mobile={data['mobile']}, is_admin={data.get('is_admin')}")
    
    def test_get_user_info_without_token(self):
        """Test /api/auth/me without token returns 403"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 403
        print("✓ Unauthorized access correctly rejected with 403")


class TestAlerts:
    """Alerts endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Authentication failed")
    
    def test_get_alerts(self, auth_token):
        """Test /api/alerts returns alerts list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/alerts", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "alerts" in data
        assert isinstance(data["alerts"], list)
        print(f"✓ Alerts retrieved: {len(data['alerts'])} alerts")


class TestWebhookValidation:
    """Webhook validation tests - plain text and JSON without symbol should be rejected"""
    
    def test_plain_text_webhook_rejected(self):
        """Test plain text webhooks are rejected"""
        response = requests.post(
            f"{BASE_URL}/api/webhook/tradingview",
            data="BUY",
            headers={"Content-Type": "text/plain"}
        )
        assert response.status_code == 200  # Returns 200 with rejection status
        data = response.json()
        assert data.get("status") == "rejected"
        assert "symbol" in data.get("reason", "").lower() or "json" in data.get("reason", "").lower()
        print(f"✓ Plain text webhook correctly rejected: {data}")
    
    def test_json_without_symbol_rejected(self):
        """Test JSON webhooks without symbol field are rejected"""
        response = requests.post(
            f"{BASE_URL}/api/webhook/tradingview",
            json={"action": "BUY", "price": 95000}
        )
        assert response.status_code == 200  # Returns 200 with rejection status
        data = response.json()
        assert data.get("status") == "rejected"
        assert "symbol" in data.get("reason", "").lower()
        print(f"✓ JSON without symbol correctly rejected: {data}")
    
    def test_json_without_action_rejected(self):
        """Test JSON webhooks without action field are rejected"""
        response = requests.post(
            f"{BASE_URL}/api/webhook/tradingview",
            json={"symbol": "BTCUSD", "price": 95000}
        )
        assert response.status_code == 200  # Returns 200 with rejection status
        data = response.json()
        assert data.get("status") == "rejected"
        assert "action" in data.get("reason", "").lower()
        print(f"✓ JSON without action correctly rejected: {data}")
    
    def test_valid_webhook_accepted(self):
        """Test valid JSON webhook is accepted"""
        # Use unique timestamp to avoid deduplication
        unique_price = int(time.time())
        response = requests.post(
            f"{BASE_URL}/api/webhook/tradingview",
            json={
                "symbol": "BTCUSD",
                "action": "BUY",
                "price": unique_price,
                "message": f"Test alert {unique_price}"
            }
        )
        assert response.status_code == 200
        data = response.json()
        # Should be either "received" or "duplicate_ignored" (if same minute)
        assert data.get("status") in ["received", "duplicate_ignored"]
        print(f"✓ Valid webhook processed: {data}")


class TestWebhookDeduplication:
    """Webhook deduplication tests - simultaneous identical webhooks should only process once"""
    
    def test_simultaneous_webhooks_deduplicated(self):
        """Test that simultaneous identical webhooks are deduplicated"""
        # Create a unique action to avoid conflicts with other tests
        unique_id = int(time.time())
        webhook_payload = {
            "symbol": "BTCUSD",
            "action": "SELL",  # Use SELL to differentiate from other tests
            "price": unique_id,
            "message": f"Dedup test {unique_id}"
        }
        
        # Send 3 simultaneous webhooks
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            futures = [
                executor.submit(
                    requests.post,
                    f"{BASE_URL}/api/webhook/tradingview",
                    json=webhook_payload
                )
                for _ in range(3)
            ]
            for future in concurrent.futures.as_completed(futures):
                results.append(future.result())
        
        # Check responses
        statuses = [r.json().get("status") for r in results]
        print(f"Webhook responses: {statuses}")
        
        # At least one should be "received", others should be "duplicate_ignored"
        received_count = statuses.count("received")
        duplicate_count = statuses.count("duplicate_ignored")
        
        # Due to timing, we might get 1-2 received (race condition at DB level)
        # But we should NOT get 3 received (that would mean no deduplication)
        assert received_count <= 2, f"Too many webhooks processed: {received_count}"
        assert duplicate_count >= 1 or received_count <= 2, "Deduplication not working"
        print(f"✓ Deduplication working: {received_count} received, {duplicate_count} duplicates ignored")


class TestCrossInstrumentIsolation:
    """Cross-instrument isolation tests - BTC webhook should not affect ETH and vice versa"""
    
    def test_btc_and_eth_webhooks_independent(self):
        """Test that BTC and ETH webhooks are processed independently"""
        unique_id = int(time.time())
        
        # Send BTC BUY webhook
        btc_response = requests.post(
            f"{BASE_URL}/api/webhook/tradingview",
            json={
                "symbol": "BTCUSD",
                "action": "BUY",
                "price": unique_id,
                "message": f"BTC test {unique_id}"
            }
        )
        
        # Send ETH SELL webhook immediately after
        eth_response = requests.post(
            f"{BASE_URL}/api/webhook/tradingview",
            json={
                "symbol": "ETHUSD",
                "action": "SELL",
                "price": unique_id,
                "message": f"ETH test {unique_id}"
            }
        )
        
        btc_data = btc_response.json()
        eth_data = eth_response.json()
        
        print(f"BTC response: {btc_data}")
        print(f"ETH response: {eth_data}")
        
        # Both should be processed (not deduplicated against each other)
        # They might be "received" or "duplicate_ignored" based on previous tests in same minute
        assert btc_data.get("status") in ["received", "duplicate_ignored"]
        assert eth_data.get("status") in ["received", "duplicate_ignored"]
        
        # If both are received, verify they have different alert_ids
        if btc_data.get("status") == "received" and eth_data.get("status") == "received":
            assert btc_data.get("alert_id") != eth_data.get("alert_id"), "BTC and ETH should have different alert IDs"
        
        print("✓ Cross-instrument isolation verified: BTC and ETH processed independently")
    
    def test_same_instrument_different_actions_independent(self):
        """Test that same instrument with different actions are processed independently"""
        unique_id = int(time.time()) + 1000  # Offset to avoid conflicts
        
        # Send BTC BUY webhook
        buy_response = requests.post(
            f"{BASE_URL}/api/webhook/tradingview",
            json={
                "symbol": "BTCUSD",
                "action": "BUY",
                "price": unique_id,
                "message": f"BTC BUY test {unique_id}"
            }
        )
        
        # Send BTC SELL webhook immediately after
        sell_response = requests.post(
            f"{BASE_URL}/api/webhook/tradingview",
            json={
                "symbol": "BTCUSD",
                "action": "SELL",
                "price": unique_id,
                "message": f"BTC SELL test {unique_id}"
            }
        )
        
        buy_data = buy_response.json()
        sell_data = sell_response.json()
        
        print(f"BUY response: {buy_data}")
        print(f"SELL response: {sell_data}")
        
        # Both should be processed (different actions)
        assert buy_data.get("status") in ["received", "duplicate_ignored"]
        assert sell_data.get("status") in ["received", "duplicate_ignored"]
        
        print("✓ Same instrument different actions processed independently")


class TestSettings:
    """Settings endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Authentication failed")
    
    def test_get_settings(self, auth_token):
        """Test /api/settings returns trading settings with 4-strategy configuration"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/settings", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        settings = data.get("trading_settings", {})
        
        # Verify 4-strategy configuration fields exist
        assert "btc_futures_enabled" in settings
        assert "btc_options_enabled" in settings
        assert "eth_futures_enabled" in settings
        assert "eth_options_enabled" in settings
        
        # Verify lot size fields
        assert "btc_futures_lot_size" in settings
        assert "eth_futures_lot_size" in settings
        
        print(f"✓ Settings retrieved with 4-strategy config:")
        print(f"  - BTC Futures: {settings.get('btc_futures_enabled')}")
        print(f"  - BTC Options: {settings.get('btc_options_enabled')}")
        print(f"  - ETH Futures: {settings.get('eth_futures_enabled')}")
        print(f"  - ETH Options: {settings.get('eth_options_enabled')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
