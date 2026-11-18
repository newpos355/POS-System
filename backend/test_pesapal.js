const dotenv = require('dotenv');
dotenv.config();

const { pesapalPosNotification, verifyPesapalTransaction } = require('./controllers/pesapalController');

async function testPesapalEndpoints() {
  console.log('--- Testing Pesapal Wireless POS Notification (Endpoint 1) ---');
  
  // Mock req & res for Endpoint 1
  const mockReq1 = {
    headers: {
      consumerkey: 'TDpigBOOhs+zAl8cwH2Fl82jJGyD8xev',
      consumersecret: '1KpqkfsMaihIcOlhnBo/gBZ5smw=',
    },
    body: {
      id: 10463,
      first_name: "John",
      last_name: "Doe",
      phone: "+256771234567",
      amount: 50000.0,
      payment_option: "Airtel Money",
      transaction_date: new Date().toISOString(),
      currency: "UGX",
      merchant_reference: "SO-2026-999",
      confirmation_code: "UGX_MOMO_98765"
    }
  };

  const mockRes1 = {
    status(code) {
      console.log('Endpoint 1 Response Code:', code);
      return this;
    },
    json(data) {
      console.log('Endpoint 1 Response Payload:', data);
      return this;
    }
  };

  await pesapalPosNotification(mockReq1, mockRes1);

  console.log('\n--- Testing Pesapal Transaction Verification (Endpoint 2) ---');

  const mockReq2 = {
    body: {
      confirmation_code: "UGX_MOMO_98765",
      merchant_reference: "SO-2026-999",
      amount: 50000.0
    }
  };

  const mockRes2 = {
    status(code) {
      console.log('Endpoint 2 Response Code:', code);
      return this;
    },
    json(data) {
      console.log('Endpoint 2 Response Payload:', data);
      return this;
    }
  };

  await verifyPesapalTransaction(mockReq2, mockRes2);
}

testPesapalEndpoints();
