# TON Order Management System
This project is a TON Order Management System built using TypeScript and Express.js. It allows users to create, retrieve, update, and delete orders, as well as fetch and process transactions. The system is designed to work with the Telegram Wallet API for processing payments.

## Prerequisites
Make sure you have Node.js and npm installed on your machine. You'll also need a .env file in the project root with the following variables:
```
MNEMONIC="your_ton_wallet_24_word_mnemonic_phrase"
WALLET_API="your_wallet_pay_api_key"
NETWORK="testnet/mainnet"
API_KEY="your_toncenter_api_key"
CALLBACK="your_callback_url"
```

## Getting Started
### Install dependencies:
```
npm install
npm run build
```
### Run the application:
```
npm run start
```

### The server will be running on http://localhost:5000.

## Features

### Order Endpoints


**Create Order:**
*Endpoint:* POST /order/

Creates a new order based on the provided parameters.

*Request Parameters:*
```
amount (number): The order amount.
description (string): Description of the order.
return_url (string): URL for callback on order completion.
user_id (number): User ID associated with the order.
```

**Fetch Price:**
*Endpoint:* POST /price/:currency/

Converts the provided amount to TON based on the TON/CURRENCY rate.

*Request Parameters:*
```
currency (string): Target currency for conversion.
amount (number): The amount to be converted.
```

**Fetch Order List:**
*Endpoint:* GET /order/

Retrieves a list of open orders.

**Fetch Order by ID:**
*Endpoint:* GET /order/:orderid/

Retrieves order details based on the provided order ID.

*Request Parameters:*
```
orderid (string): ID of the order.
```

**Delete Order by ID:**
*Endpoint:* DELETE /order/:orderid/

Deletes an order based on the provided order ID.

*Request Parameters:*
```
orderid (string): ID of the order.
```

**Create Order with Currency:**
*Endpoint:* POST /order/:currency/

Creates a new order with the specified currency. Converts the provided amount to TON based on the TON/CURRENCY rate for the specified currency.

*Request Parameters:*
```
amount (number): The order amount.
description (string): Description of the order.
return_url (string): URL for callback on order completion.
user_id (number): User ID associated with the order.
```

**Transaction Processing**
*Fetch Transactions:*
The system fetches incoming transactions for open orders at regular intervals (every 60 seconds). Transactions are processed and matched with open orders.

**Wallet Integration**
*Wallet Order:*
The system fetches incoming transactions for @wallet pay orders at regular intervals (every 60 seconds). Transactions are processed and matched with open orders.

### Additional Features
**Logging:**
The application logs messages, errors, warnings, and debug information to a file (./data/app.log).

## License
This project is licensed under the MIT License - see the LICENSE file for details.