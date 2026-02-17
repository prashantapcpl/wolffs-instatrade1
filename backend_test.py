import requests
import sys
import json
from datetime import datetime

class WolffsAutoTradeAPITester:
    def __init__(self, base_url="https://insta-trade-bot.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.user_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                except:
                    print(f"   Response: {response.text[:200]}...")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")

            return success, response.json() if response.text else {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test API health check"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "api/health",
            200
        )
        return success

    def test_register(self, mobile, password, name=None):
        """Test user registration"""
        success, response = self.run_test(
            "User Registration",
            "POST",
            "api/auth/register",
            200,
            data={"mobile": mobile, "password": password, "name": name}
        )
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response.get('user', {}).get('id')
            return True
        return False

    def test_login(self, mobile, password):
        """Test user login"""
        success, response = self.run_test(
            "User Login",
            "POST",
            "api/auth/login",
            200,
            data={"mobile": mobile, "password": password}
        )
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response.get('user', {}).get('id')
            return True
        return False

    def test_get_me(self):
        """Test get current user info"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "api/auth/me",
            200
        )
        return success

    def test_get_settings(self):
        """Test get trading settings"""
        success, response = self.run_test(
            "Get Settings",
            "GET",
            "api/settings",
            200
        )
        return success

    def test_update_settings(self):
        """Test update trading settings"""
        settings_data = {
            "instruments": ["BTC", "ETH"],
            "trade_futures": True,
            "trade_options": False,
            "contract_quantity": 2,
            "profit_percentage": 80.0,
            "exit_half_position": True
        }
        success, response = self.run_test(
            "Update Settings",
            "PUT",
            "api/settings",
            200,
            data=settings_data
        )
        return success

    def test_delta_status(self):
        """Test Delta Exchange status"""
        success, response = self.run_test(
            "Delta Status",
            "GET",
            "api/delta/status",
            200
        )
        return success

    def test_tradingview_webhook(self):
        """Test TradingView webhook endpoint"""
        webhook_data = {
            "symbol": "BTCUSD",
            "action": "BUY",
            "price": 95000,
            "message": "Test alert from backend test"
        }
        success, response = self.run_test(
            "TradingView Webhook",
            "POST",
            "api/webhook/tradingview",
            200,
            data=webhook_data
        )
        return success

    def test_get_alerts(self):
        """Test get alerts"""
        success, response = self.run_test(
            "Get Alerts",
            "GET",
            "api/alerts",
            200
        )
        return success

    def test_get_recent_alerts(self):
        """Test get recent alerts (public endpoint)"""
        success, response = self.run_test(
            "Get Recent Alerts",
            "GET",
            "api/alerts/recent",
            200
        )
        return success

    def test_webhook_info(self):
        """Test webhook info endpoint"""
        success, response = self.run_test(
            "Webhook Info",
            "GET",
            "api/webhook/info",
            200
        )
        return success

    def test_get_trades(self):
        """Test get user trades"""
        success, response = self.run_test(
            "Get Trades",
            "GET",
            "api/trades",
            200
        )
        return success

def main():
    # Setup
    tester = WolffsAutoTradeAPITester()
    test_mobile = f"9876543{datetime.now().strftime('%H%M%S')}"
    test_password = "TestPass123!"
    test_name = "Test User"

    print("🚀 Starting Wolffs Insta AutoTrade API Tests")
    print(f"📱 Test Mobile: {test_mobile}")
    print(f"🔗 Base URL: {tester.base_url}")

    # Test 1: Health Check
    if not tester.test_health_check():
        print("❌ Health check failed, stopping tests")
        return 1

    # Test 2: User Registration
    if not tester.test_register(test_mobile, test_password, test_name):
        print("❌ Registration failed, stopping tests")
        return 1

    # Test 3: Get current user info
    if not tester.test_get_me():
        print("❌ Get user info failed")

    # Test 4: Get settings
    if not tester.test_get_settings():
        print("❌ Get settings failed")

    # Test 5: Update settings
    if not tester.test_update_settings():
        print("❌ Update settings failed")

    # Test 6: Delta status
    if not tester.test_delta_status():
        print("❌ Delta status check failed")

    # Test 7: TradingView webhook
    if not tester.test_tradingview_webhook():
        print("❌ TradingView webhook failed")

    # Test 8: Get alerts
    if not tester.test_get_alerts():
        print("❌ Get alerts failed")

    # Test 9: Get recent alerts (public)
    if not tester.test_get_recent_alerts():
        print("❌ Get recent alerts failed")

    # Test 10: Webhook info
    if not tester.test_webhook_info():
        print("❌ Webhook info failed")

    # Test 11: Get trades
    if not tester.test_get_trades():
        print("❌ Get trades failed")

    # Test 12: Test login with existing credentials
    tester.token = None  # Clear token to test login
    if not tester.test_login(test_mobile, test_password):
        print("❌ Login with existing credentials failed")

    # Print results
    print(f"\n📊 Test Results:")
    print(f"   Tests Run: {tester.tests_run}")
    print(f"   Tests Passed: {tester.tests_passed}")
    print(f"   Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())