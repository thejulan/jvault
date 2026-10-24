import httpx

def main():
    client = httpx.Client(base_url='http://127.0.0.1:8000', timeout=10.0)

    # 1. Test Dashboard Home
    r0 = client.get('/')
    assert r0.status_code == 200, f'Status {r0.status_code}'
    assert 'JVault' in r0.text
    print('1. Dashboard HTML loaded ok')

    # 2. Test Login
    r1 = client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
    assert r1.status_code == 200, f'Login failed: {r1.text}'
    auth_data = r1.json()
    token = auth_data['token']
    headers = {'Authorization': f'Bearer {token}'}
    print('2. Admin login successful, token obtained')

    # 3. Test Wallets listing
    r2 = client.get('/api/wallets', headers=headers)
    assert r2.status_code == 200
    wallets = r2.json()
    assert len(wallets) >= 1
    wallet_id = wallets[0]['id']
    print(f"3. Wallets listed: {len(wallets)} wallet(s) found. ID: {wallet_id}")

    # 4. Test Addresses of Wallet
    r3 = client.get(f'/api/wallets/{wallet_id}/addresses', headers=headers)
    assert r3.status_code == 200
    addrs = r3.json()
    nets = [a['network_id'] for a in addrs]
    print(f"4. Wallet addresses count: {len(addrs)} (Networks: {nets})")

    # 5. Test Fast Receive Currencies Matrix
    r4 = client.get('/api/payments/currencies')
    assert r4.status_code == 200
    curr_matrix = r4.json()
    assert 'USDT' in curr_matrix
    print('5. Fast Receive currencies loaded:', list(curr_matrix.keys()))

    # 6. Test Create Fast Payment Invoice (e.g. 100 USDT on TRON TRC20)
    r5 = client.post('/api/payments/create', json={
        'currency': 'USDT',
        'network_id': 'tron',
        'amount': 100.0,
        'description': 'Test Client Invoice',
        'wallet_id': wallet_id
    })
    assert r5.status_code == 200
    pay_data = r5.json()
    pay_id = pay_data['id']
    print(f"6. Payment created: {pay_id}, Address: {pay_data['pay_address']}, TG Link: {pay_data['telegram_link']}")

    # 7. Test QR image endpoint
    r6 = client.get(f'/api/payments/{pay_id}/qr.png')
    assert r6.status_code == 200
    assert r6.headers['content-type'] == 'image/png'
    print(f"7. QR Code PNG generated ok ({len(r6.content)} bytes)")

    # 8. Test Simulation of Payment Progression
    r7 = client.post(f'/api/payments/{pay_id}/simulate')
    assert r7.status_code == 200
    assert r7.json()['status'] == 'CONFIRMING'
    print('8a. Simulated status moved to: CONFIRMING')

    r8 = client.post(f'/api/payments/{pay_id}/simulate')
    assert r8.status_code == 200
    assert r8.json()['status'] == 'PAID'
    print('8b. Simulated status moved to: PAID (Confirmed!)')

    # 9. Test Public Checkout Page
    r9 = client.get(f'/pay/{pay_id}')
    assert r9.status_code == 200
    assert 'JVault Checkout' in r9.text
    print('9. Public Checkout page /pay/{id} loaded ok')

    print('\nALL AUTOMATED INTEGRATION TESTS PASSED SUCCESSFULLY!')

if __name__ == '__main__':
    main()
