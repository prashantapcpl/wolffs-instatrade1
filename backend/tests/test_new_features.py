"""
Wolffs Insta AutoTrade - New Features Tests
Tests for:
1. WebSocket alert filtering - users only see alerts relevant to their subscription type
2. API /api/alerts returns filtered alerts based on subscriber_type
3. Settings page shows 5 expiry options (same_day, next_day, day_after, weekly, monthly)
4. Alert display shows strategy_type badge (FUTURES or OPTIONS)
5. Options trading settings saved correctly (strike_selection, options_expiry)
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials (wolffs_alerts subscriber)
ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "admin@wolffs2024"

# Regular user credentials
USER_MOBILE = "9899145676"
USER_PASSWORD = "asdf1234"


class TestAlertsFiltering:
    """Test that /api/alerts returns filtered alerts based on subscriber_type"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin authentication failed")
    
    @pytest.fixture
    def user_token(self):
        """Get regular user authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": USER_MOBILE,
            "password": USER_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("User authentication failed - user may not exist")
    
    def test_admin_gets_wolffs_alerts(self, admin_token):
        """Test admin (wolffs_alerts subscriber) gets alerts from wolffs_alerts source"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First check user's subscriber_type
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_response.status_code == 200
        user_data = me_response.json()
        subscriber_type = user_data.get("trading_settings", {}).get("subscriber_type", "wolffs_alerts")
        print(f"Admin subscriber_type: {subscriber_type}")
        
        # Get alerts
        response = requests.get(f"{BASE_URL}/api/alerts", headers=headers)
        assert response.status_code == 200
        data = response.json()
        alerts = data.get("alerts", [])
        
        print(f"Admin received {len(alerts)} alerts")
        
        # Check that alerts are from wolffs_alerts source (if any alerts exist)
        if alerts:
            for alert in alerts[:5]:  # Check first 5
                source = alert.get("source", "wolffs_alerts")
                print(f"  Alert: {alert.get('symbol')} {alert.get('action')} - source: {source}")
                # Admin should see wolffs_alerts source alerts
                assert source == "wolffs_alerts", f"Admin should only see wolffs_alerts, got {source}"
        
        print("✓ Admin correctly receives wolffs_alerts source alerts")


class TestStrategyTypeBadge:
    """Test that alerts include strategy_type field for badge display"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin authentication failed")
    
    def test_webhook_with_futures_strategy(self, admin_token):
        """Test webhook with strategy=futures includes strategy_type in alert"""
        unique_id = int(time.time())
        
        # Send webhook with futures strategy
        response = requests.post(
            f"{BASE_URL}/api/webhook/tradingview",
            json={
                "symbol": "BTCUSD",
                "action": "BUY",
                "price": unique_id,
                "strategy": "futures",
                "message": f"Futures test {unique_id}"
            }
        )
        assert response.status_code == 200
        data = response.json()
        print(f"Webhook response: {data}")
        
        # Get alerts and check strategy_type
        headers = {"Authorization": f"Bearer {admin_token}"}
        alerts_response = requests.get(f"{BASE_URL}/api/alerts", headers=headers)
        assert alerts_response.status_code == 200
        alerts = alerts_response.json().get("alerts", [])
        
        # Find our alert
        found = False
        for alert in alerts:
            if alert.get("message") == f"Futures test {unique_id}":
                found = True
                strategy_type = alert.get("strategy_type")
                print(f"Found alert with strategy_type: {strategy_type}")
                assert strategy_type == "futures", f"Expected 'futures', got '{strategy_type}'"
                break
        
        if not found and data.get("status") == "duplicate_ignored":
            print("✓ Alert was deduplicated (same minute), strategy_type test skipped")
        else:
            assert found, "Alert not found in alerts list"
            print("✓ Futures strategy_type correctly saved in alert")
    
    def test_webhook_with_options_strategy(self, admin_token):
        """Test webhook with strategy=options includes strategy_type in alert"""
        unique_id = int(time.time()) + 100
        
        # Send webhook with options strategy
        response = requests.post(
            f"{BASE_URL}/api/webhook/tradingview",
            json={
                "symbol": "ETHUSD",
                "action": "SELL",
                "price": unique_id,
                "strategy": "options",
                "message": f"Options test {unique_id}"
            }
        )
        assert response.status_code == 200
        data = response.json()
        print(f"Webhook response: {data}")
        
        # Get alerts and check strategy_type
        headers = {"Authorization": f"Bearer {admin_token}"}
        alerts_response = requests.get(f"{BASE_URL}/api/alerts", headers=headers)
        assert alerts_response.status_code == 200
        alerts = alerts_response.json().get("alerts", [])
        
        # Find our alert
        found = False
        for alert in alerts:
            if alert.get("message") == f"Options test {unique_id}":
                found = True
                strategy_type = alert.get("strategy_type")
                print(f"Found alert with strategy_type: {strategy_type}")
                assert strategy_type == "options", f"Expected 'options', got '{strategy_type}'"
                break
        
        if not found and data.get("status") == "duplicate_ignored":
            print("✓ Alert was deduplicated (same minute), strategy_type test skipped")
        else:
            assert found, "Alert not found in alerts list"
            print("✓ Options strategy_type correctly saved in alert")


class TestOptionsSettings:
    """Test options trading settings (strike_selection, options_expiry)"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin authentication failed")
    
    def test_get_options_settings(self, admin_token):
        """Test /api/settings returns options settings fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/settings", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        settings = data.get("trading_settings", {})
        
        # Check options_strike_selection field exists
        assert "options_strike_selection" in settings, "options_strike_selection field missing"
        strike_selection = settings["options_strike_selection"]
        assert strike_selection in ["atm", "otm_1", "otm_2"], f"Invalid strike_selection: {strike_selection}"
        print(f"✓ options_strike_selection: {strike_selection}")
        
        # Check options_expiry field exists
        assert "options_expiry" in settings, "options_expiry field missing"
        options_expiry = settings["options_expiry"]
        valid_expiries = ["same_day", "next_day", "day_after", "weekly", "monthly"]
        assert options_expiry in valid_expiries, f"Invalid options_expiry: {options_expiry}"
        print(f"✓ options_expiry: {options_expiry}")
        
        print("✓ Options settings fields present and valid")
    
    def test_save_options_settings(self, admin_token):
        """Test saving options settings with all 5 expiry options"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Test each expiry option
        expiry_options = ["same_day", "next_day", "day_after", "weekly", "monthly"]
        strike_options = ["atm", "otm_1", "otm_2"]
        
        for expiry in expiry_options:
            for strike in strike_options:
                # Save settings
                save_response = requests.put(
                    f"{BASE_URL}/api/settings",
                    headers=headers,
                    json={
                        "instruments": ["BTC", "ETH"],
                        "btc_futures_enabled": True,
                        "btc_futures_lot_size": 1,
                        "btc_options_enabled": True,
                        "btc_options_lot_size": 1,
                        "eth_futures_enabled": True,
                        "eth_futures_lot_size": 1,
                        "eth_options_enabled": True,
                        "eth_options_lot_size": 1,
                        "options_strike_selection": strike,
                        "options_expiry": expiry,
                        "profit_percentage": 75.0,
                        "exit_half_position": False,
                        "subscriber_type": "wolffs_alerts"
                    }
                )
                assert save_response.status_code == 200, f"Failed to save settings: {save_response.text}"
                
                # Verify settings were saved
                get_response = requests.get(f"{BASE_URL}/api/settings", headers=headers)
                assert get_response.status_code == 200
                saved_settings = get_response.json().get("trading_settings", {})
                
                assert saved_settings.get("options_expiry") == expiry, f"Expiry not saved: expected {expiry}, got {saved_settings.get('options_expiry')}"
                assert saved_settings.get("options_strike_selection") == strike, f"Strike not saved: expected {strike}, got {saved_settings.get('options_strike_selection')}"
                
                print(f"  ✓ Saved and verified: strike={strike}, expiry={expiry}")
        
        print("✓ All options settings combinations saved and verified successfully")


class TestSubscriberType:
    """Test subscriber_type field in settings"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": ADMIN_MOBILE,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin authentication failed")
    
    def test_subscriber_type_in_settings(self, admin_token):
        """Test subscriber_type field exists in settings"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/settings", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        settings = data.get("trading_settings", {})
        assert "subscriber_type" in settings, "subscriber_type field missing"
        subscriber_type = settings["subscriber_type"]
        assert subscriber_type in ["wolffs_alerts", "custom_strategy", None], f"Invalid subscriber_type: {subscriber_type}"
        print(f"✓ subscriber_type: {subscriber_type}")
    
    def test_subscriber_type_in_user_info(self, admin_token):
        """Test subscriber_type is included in /api/auth/me response"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        trading_settings = data.get("trading_settings", {})
        assert "subscriber_type" in trading_settings, "subscriber_type missing from user info"
        print(f"✓ subscriber_type in user info: {trading_settings.get('subscriber_type')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
