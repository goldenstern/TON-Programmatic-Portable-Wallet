Below is the updated **README.md** that now includes output fields for each endpoint.

---

```markdown
# TON Order Management System

This project is a TON Order Management System built using TypeScript and Express.js. It allows users to create, retrieve, update, and delete orders, as well as fetch and process transactions. The system is designed to work with the Telegram Wallet API for processing payments.

## Prerequisites

Make sure you have Node.js and npm installed on your machine. You'll also need a `.env` file in the project root with the following variables:

```
ALLOW_SEND=false #Allow SEND TON function
ADMIN_ADDRESS="Admin cashin TON address"
PORT="service port"
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

The server will be running on `http://localhost:PORT`.

### Note:
Wallet updated to `WalletContractV5R1`!

## Features

### Order Endpoints

#### **Admin Cash In**
- **Endpoint:** `POST /admin/cashin`
- **Description:** Sends a transaction to the admin TON address specified in `.env`.
- **Request Parameters:**
  - _None_ (uses `ADMIN_ADDRESS` from environment variables)
- **Output Fields:**
  - `success` (boolean): Indicates if the cashin was successful.
  - `message` (string): Details about the transaction including amount and fee reserve used.
  - `transaction` (object): Transaction data returned by the blockchain client.
- **Example Response:**
  ```json
  {
    "success": true,
    "message": "Admin cashin: Sent 2.5 TON to admin address ... using fee reserve 0.001 TON",
    "transaction": { ... }
  }
  ```

#### **Send TON**
- **Endpoint:** `POST /send`
- **Description:** Sends a TON transaction to a specified wallet address if allowed in `.env`.
- **Request Parameters:**
  - `destination` (string): TON destination address.
  - `amount` (number): Amount in TON (e.g., 1.5).
- **Output Fields:**
  - `success` (boolean): Indicates if the transaction was successful.
  - `message` (string): Confirmation message with details about the sent amount and destination.
- **Example Response:**
  ```json
  {
    "success": true,
    "message": "Sent 1.5 TON to 0:abcdef..."
  }
  ```

#### **Create Order**
- **Endpoint:** `POST /order/`
- **Description:** Creates a new order based on the provided parameters.
- **Request Parameters:**
  - `amount` (number): The order amount.
  - `description` (string): Description of the order.
  - `return_url` (string): URL for callback on order completion.
  - `user_id` (number): User ID associated with the order.
- **Output Fields:**
  - `success` (boolean): Indicates if the order creation was successful.
  - `amount` (number): The final order amount.
  - `id` (string): Unique identifier for the created order.
  - `paylink` (string): (If applicable) Payment link from the Wallet API.
  - `wallet` (string): Wallet address (non-bounceable).
- **Example Response:**
  ```json
  {
    "success": true,
    "amount": 1.234,
    "id": "abc123",
    "paylink": "https://pay.wallet.tg/...",
    "wallet": "0:abcdef..."
  }
  ```

#### **Fetch Price**
- **Endpoint:** `POST /price/:currency/`
- **Description:** Converts the provided amount to TON based on the TON/CURRENCY rate.
- **Request Parameters:**
  - URL Parameter: `currency` (string): Target currency for conversion.
  - Body: `amount` (number): The amount to be converted.
- **Output Fields:**
  - `success` (boolean): Indicates if the conversion was successful.
  - `currency` (string): The target currency.
  - `amount` (number): The converted amount in TON.
- **Example Response:**
  ```json
  {
    "success": true,
    "currency": "RUB",
    "amount": 0.567
  }
  ```

#### **Fetch Order List**
- **Endpoint:** `GET /order/`
- **Description:** Retrieves a list of open orders.
- **Output Fields:**
  - `success` (boolean): Indicates if the retrieval was successful.
  - `orders` (array): A list of order objects. Each order includes:
    - `_id` (string): Order ID.
    - `amount` (number): Order amount.
    - `status` (string): Order status (e.g., "new", "complete", "aborted").
    - `timestamp` (number): Timestamp when the order was created.
- **Example Response:**
  ```json
  {
    "success": true,
    "orders": [
      { "_id": "order1", "amount": 1.234, "status": "new", "timestamp": 1680000000000 },
      { "_id": "order2", "amount": 2.345, "status": "new", "timestamp": 1680000100000 }
    ]
  }
  ```

#### **Fetch Order by ID**
- **Endpoint:** `GET /order/:orderid/`
- **Description:** Retrieves order details based on the provided order ID.
- **Request Parameters:**
  - URL Parameter: `orderid` (string): ID of the order.
- **Output Fields:**
  - If found, returns the order object with all order details:
    - `_id` (string)
    - `amount` (number)
    - `status` (string)
    - `timestamp` (number)
    - _Other fields as applicable._
  - If not found, returns:
    - `success` (false)
    - `message` (string): e.g., "No such orderID".
- **Example Response (Order Found):**
  ```json
  {
    "_id": "order1",
    "amount": 1.234,
    "status": "new",
    "timestamp": 1680000000000
  }
  ```
- **Example Response (Order Not Found):**
  ```json
  {
    "success": false,
    "message": "No such orderID"
  }
  ```

#### **Delete Order by ID**
- **Endpoint:** `DELETE /order/:orderid/`
- **Description:** Deletes an order based on the provided order ID.
- **Request Parameters:**
  - URL Parameter: `orderid` (string): ID of the order.
- **Output Fields:**
  - `success` (boolean): Indicates if the deletion was successful.
  - `message` (string): Confirmation message.
- **Example Response:**
  ```json
  {
    "success": true,
    "message": "Delete success"
  }
  ```

#### **Create Order with Currency**
- **Endpoint:** `POST /order/:currency/`
- **Description:** Creates a new order with the specified currency. Converts the provided amount to TON based on the TON/CURRENCY rate for the specified currency.
- **Request Parameters:**
  - URL Parameter: `currency` (string): Target currency.
  - Body:
    - `amount` (number): The order amount.
    - `description` (string): Description of the order.
    - `return_url` (string): URL for callback on order completion.
    - `user_id` (number): User ID associated with the order.
- **Output Fields:**
  - `success` (boolean): Indicates if the order creation was successful.
  - `amount` (number): The final order amount after conversion.
  - `id` (string): Unique identifier for the created order.
  - `paylink` (string): (If applicable) Payment link from the Wallet API.
  - `wallet` (string): Wallet address (non-bounceable).
- **Example Response:**
  ```json
  {
    "success": true,
    "amount": 0.789,
    "id": "order3",
    "paylink": "https://pay.wallet.tg/...",
    "wallet": "0:abcdef..."
  }
  ```

#### **Fetch Balance (to Currency)**
- **Endpoint:** `POST /balance/:currency/`
- **Description:** Fetches the wallet balance in a specified currency, converting from TON based on the current TON/CURRENCY rate.
- **Request Parameters:**
  - URL Parameter: `currency` (string): The target currency.
- **Output Fields:**
  - `success` (boolean): Indicates if the retrieval was successful.
  - `walletBalance` (string): The wallet balance in TON.
  - `currency` (string): The target currency.
  - `convertedBalance` (number): The wallet balance converted to the target currency.
- **Example Response:**
  ```json
  {
    "success": true,
    "walletBalance": "5.678",
    "currency": "USD",
    "convertedBalance": 123.45
  }
  ```

#### **Fetch Balance**
- **Endpoint:** `POST /balance/`
- **Description:** Fetches the wallet balance in TON.
- **Output Fields:**
  - `success` (boolean): Indicates if the retrieval was successful.
  - `walletBalance` (string): The wallet balance in TON.
- **Example Response:**
  ```json
  {
    "success": true,
    "walletBalance": "5.678"
  }
  ```

### Transaction Processing

#### **Fetch Transactions**
- **Description:** The system periodically (every 60 seconds) fetches incoming transactions for open orders. Transactions are processed, matched with open orders, and stored in the database. If a matching order is found:
  - The order is closed via a callback.
  - The order's status is updated to `complete`.
- **Output Fields (Logged and Database Entries):**
  - Each transaction stored includes:
    - `hash` (string): Transaction hash.
    - `timestamp` (number): Time of transaction processing.
  - Orders updated will log details about the matching and update process.

#### **Wallet API Order Checking**
- **Description:** If the Wallet API is configured, the system checks orders through the Wallet API at regular intervals and updates order statuses accordingly.
- **Output Fields (Logged):**
  - Logs include payment status details, and when an order is found to be `PAID`, it is closed and updated to `complete`.

### Additional Features

#### **Logging**
- The application logs messages, errors, warnings, and debug information to a file (`./data/app.log`).

## License

This project is licensed under the MIT License - see the LICENSE file for details.
```

---

This version of the README includes additional **Output Fields** sections for each endpoint, detailing the keys and types of data returned by the API responses.
