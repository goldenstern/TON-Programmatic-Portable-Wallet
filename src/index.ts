import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express'
import { HttpApi, WalletContractV5R1, TonClient, fromNano, toNano, internal, SendMode } from "@ton/ton";
import { mnemonicToWalletKey } from "@ton/crypto";
import Datastore from 'nedb';
import axios from 'axios';
import fs from 'fs';
import buffer from 'buffer';

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

const app = express();
app.use(express.json());
const port = process.env.PORT;

// Logger (unchanged)
const logFilePath = './data/app.log';
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleDebug = console.debug;
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

console.log = (...args) => {
  originalConsoleLog(...args);
  logStream.write(`[LOG] ${new Date().toISOString()} ${args.join(' ')}\n`);
};
console.error = (...args) => {
  originalConsoleError(...args);
  logStream.write(`[ERROR] ${new Date().toISOString()} ${args.join(' ')}\n`);
};
console.warn = (...args) => {
  originalConsoleWarn(...args);
  logStream.write(`[WARNING] ${new Date().toISOString()} ${args.join(' ')}\n`);
};
console.debug = (...args) => {
  originalConsoleDebug(...args);
  logStream.write(`[DEBUG] ${new Date().toISOString()} ${args.join(' ')}\n`);
};

const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
const transactionsDb = new Datastore({ filename: './data/transactions.db', autoload: true });

function findOrdersRecursive(ordersDb: Datastore, amount: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
        ordersDb.find({ amount, status: 'new' }, (err, orders) => {
            if (err) {
                reject(err);
            } else {
                resolve(orders);
            }
        });
    });
}

async function main() {
    const mnemonic = process.env.MNEMONIC as string;
    const key = await mnemonicToWalletKey(mnemonic.split(" "));
    // Create wallet using V5 and output non-bounceable (UQ) address
    const wallet = await WalletContractV5R1.create({ publicKey: key.publicKey }); //, workchain: 0
    // Create a TonClient instance (adjust endpoint as needed)
    const client = new TonClient({
        endpoint: process.env.NETWORK === "mainnet" 
            ? "https://toncenter.com/api/v2/jsonRPC" 
            : "https://testnet.toncenter.com/api/v2/jsonRPC",
        apiKey: process.env.API_KEY,
    });
    const contract = await client.open(wallet);

    // Log current wallet balance
    const balanceNano: bigint = await contract.getBalance();

    // ----- Endpoint 1: Send TON to a specified wallet address -----
    app.post('/send', async (req, res) => {
        try {
            const sendAllowed = process.env.ALLOW_SEND;
            if (!sendAllowed) {
                return res.status(500).json({ error: "ALLOW_SEND is not defined in .env" }); // Fixed error message
            }
            const { destination, amount } = req.body; // amount in TON, e.g. 1.5
            if (!destination || !amount) {
                return res.status(400).json({ error: "destination and amount are required" });
            }

            const seqno = await contract.getSeqno();
            console.log('amtToSend',amount)
            console.log('nanoToSend',await toNano(amount))
            // Prepare internal message - REMOVED await as internal() is not async
            const transferMessage = internal({
              to: destination,
              value: await toNano(amount),
              bounce: false,
              body: "Hello world"
            });
            
            // Send transaction
            const transaction = await contract.sendTransfer({
              seqno,
              secretKey: key.secretKey,
              messages: [transferMessage],
              sendMode: SendMode.IGNORE_ERRORS //SendMode.PAY_GAS_SEPARATELY,
            });

            await res.json({ success: true, message: `Sent ${amount} TON to ${destination}` });
            console.log(`Sent ${amount} TON to ${destination}`);
            console.log(transaction);
            
       } catch (err: any) {
           console.error(err);
           res.status(500).json({ error: err.message });
       }
     });

    // ----- Endpoint 2: Admin cashin – transfer all funds (minus a dynamic fee) to admin address -----
    app.post('/admin/cashin', async (req, res) => {
        try {
            const adminAddress = process.env.ADMIN_ADDRESS;
            if (!adminAddress) {
                return res.status(500).json({ error: "ADMIN_ADDRESS is not defined in .env" });
            }
            
            let balanceNano = await contract.getBalance();
            let balanceTON = parseFloat(fromNano(balanceNano));
            
            let feeTON = 0.001;
            const feeIncrement = 0.001;
            const maxRetries = 13;
            let success = false;
            let lastError;
            
            for (let i = 0; i < maxRetries; i++) {
                if (balanceTON <= feeTON) {
                    return res.status(400).json({ error: "Insufficient balance for admin cashin" });
                }
                
                const amountToSendTON = balanceTON - feeTON;
                const seqno = await contract.getSeqno();
                console.log('amtToSend',amountToSendTON)
                console.log('nanoToSend',await toNano(amountToSendTON))
                // Prepare internal message
                const transferMessage = await internal({
                    to: adminAddress,
                    value: await toNano(amountToSendTON),
                    bounce: false,
                    body: "Admin cashin"
                });
                
                // REMOVED THE BREAK STATEMENT
                
                try {
                    // const transaction = 'TTT';
                    const transaction = await contract.sendTransfer({
                        seqno,
                        secretKey: key.secretKey,
                        messages: [transferMessage],
                        sendMode: SendMode.IGNORE_ERRORS //SendMode.PAY_GAS_SEPARATELY,
                    });
                    
                    await res.json({ 
                        success: true, 
                        message: `Admin cashin: Sent ${amountToSendTON} TON to admin address ${adminAddress} using fee reserve ${feeTON} TON`,
                        transaction: transaction
                    });
                    
                    console.log(`Admin cashin: Sent ${amountToSendTON} TON to admin address ${adminAddress} using fee reserve ${feeTON} TON`)
                    console.log(transaction);
                    success = true;
                    break;
                } catch (err) {
                    lastError = err;
                    console.error(`Cashin attempt ${i + 1} failed with fee reserve ${feeTON} TON: ${err.message}`);
                    feeTON += feeIncrement;
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            
            if (!success) {
                res.status(500).json({ error: `Admin cashin failed after ${maxRetries} attempts. Last error: ${lastError.message}` });
            }
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    });

    // Existing endpoints...
    app.post('/order/', async function(req, res) {
        let amount: number = parseFloat(parseFloat(req.body.amount).toFixed(3));
        let description: string = req.body.description;
        let return_url: string = req.body.return_url;
        let user_id: number = req.body.user_id;

        ordersDb.find({ amount, status: 'new' }, async (err, orders) => {
            if (err) {
                res.status(500).send({ error: err });
                return;
            } 
            if (orders.length === 0) {
                console.log("No same Orders, price unmodified");
                const orderInfo = { 
                    status: 'new',
                    amount: amount, 
                    timestamp: Date.now(),
                    wallet_order_id: null
                };
                ordersDb.insert(orderInfo, async (err, newDoc) => {
                    if (err) {
                        res.status(500).send({ error: err });
                    } else {
                        const newRecordId = (newDoc as { _id?: string })?._id;
                        let wallet_l;
                        if (process.env.WALLET_API.length > 0) {
                            wallet_l = await walletOrder(newRecordId, user_id, amount, 'TON', description, '', return_url);
                        }
                        const responseObj = {
                            success: true,
                            amount: amount,
                            id: newRecordId,
                            paylink: process.env.WALLET_API.length > 0 ? wallet_l.directPayLink : '',
                            wallet: wallet.address.toString({ bounceable: false, testOnly: false })
                        };
                        if (process.env.WALLET_API.length > 0) {
                            ordersDb.update({ _id: newRecordId }, { $set: { wallet_order_id: wallet_l.id } }, {}, function (err, numUpdated) {
                                if (err) {
                                    console.error(err);
                                } else {
                                    res.json(responseObj);
                                }
                            });
                        } else {
                            res.json(responseObj);
                        }
                    }
                });
            } else {
                console.log("Same Orders, price modified");
                let foundOrders: any[] = [];
                foundOrders = await findOrdersRecursive(ordersDb, amount);
                while (foundOrders.length > 0) {
                    amount = parseFloat(fromNano(toNano(amount) + toNano(0.001)));
                    foundOrders = await findOrdersRecursive(ordersDb, amount);
                }
                const orderInfo = { 
                    status: 'new',
                    amount: amount, 
                    timestamp: Date.now(),
                    wallet_order_id: null
                };
                console.log("Same AMT NEW: ", amount);
                ordersDb.insert(orderInfo, async (err, newDoc) => {
                    if (err) {
                        res.status(500).send({ error: err });
                    } else {
                        const newRecordId = (newDoc as { _id?: string })?._id;
                        let wallet_l;
                        if (process.env.WALLET_API.length > 0) {
                            wallet_l = await walletOrder(newRecordId, user_id, amount, 'TON', description, '', return_url);
                        }
                        const responseObj = {
                            success: true,
                            amount: amount,
                            id: newRecordId,
                            paylink: process.env.WALLET_API.length > 0 ? wallet_l.directPayLink : '',
                            wallet: wallet.address.toString({ bounceable: false, testOnly: false })
                        };
                        if (process.env.WALLET_API.length > 0) {
                            ordersDb.update({ _id: newRecordId }, { $set: { wallet_order_id: wallet_l.id } }, {}, function (err, numUpdated) {
                                if (err) {
                                    console.error(err);
                                } else {
                                    res.json(responseObj);
                                }
                            });
                        } else {
                            res.json(responseObj);
                        }
                    }
                });
            }
        });
    });

    app.post('/price/:currency/', function(req, res) {
            let currency: string = req.params.currency;
            let amount: number = parseFloat(req.body.amount);
            fetchTonRate(currency)
                .then((tonRate) => {
                    console.log(`TON to RUB rate: ${tonRate}`);
                    amount = parseFloat((amount / tonRate).toFixed(3));
                    const responseObj = {
                        success: true,
                        currency: currency,
                        //message: `Created order for ${amount} with id ${newRecordId}`,
                        amount: amount,
                    };
                    res.json(responseObj);
                })
                .catch((error) => {
                    console.error('Error:', error);
                    res.status(500).send({ error: error })
                });
        });

        // /balance/:currency/ endpoint
        app.post('/balance/:currency/', async (req, res) => {
            const currency = req.params.currency.toLowerCase();

            try {
                const walletBalance = await getWalletBalance();
                const tonRate = await fetchTonRate(currency);

                const convertedBalance = parseFloat((parseFloat(walletBalance) * tonRate).toFixed(3));

                res.json({
                    success: true,
                    walletBalance,
                    currency,
                    convertedBalance,
                });
            } catch (error) {
                console.error('Error fetching balance:', error.message);
                res.status(500).send({ error: error.message });
            }
        });

        // /balance/ endpoint
        app.post('/balance/', async (req, res) => {
            try {
                const walletBalance = await getWalletBalance();

                res.json({
                    success: true,
                    walletBalance,
                });
            } catch (error) {
                console.error('Error fetching balance:', error.message);
                res.status(500).send({ error: error.message });
            }
        });

        app.post('/order/:currency/', async function(req, res) {
            console.log(`TON to ${req.params.currency} ORDER: `, req.body);
            let amount: number = parseFloat(req.body.amount);
            let currency: string = req.params.currency;
            let return_url: string = req.body.return_url
            let description: string = req.body.description
            let user_id: number = req.body.user_id
            fetchTonRate(currency)
                .then((tonRate) => {
                    console.log(`TON to CURRENCY rate: ${tonRate}`);
                    amount = parseFloat((amount / tonRate).toFixed(3));
                    ordersDb.find({ amount, status: 'new' }, async (err, orders) => {
                        if (err) {
                            res.status(500).send({ error: err })
                        } 
                        if (orders.length === 0) {
                            console.log("No same Orders, price umnodified")
                            const orderInfo = { 
                                status: 'new',
                                amount: amount as number, 
                                timestamp: Date.now(),
                                wallet_order_id: null
                            };
                            ordersDb.insert(orderInfo, async (err, newDoc) => {
                                if (err) {
                                    res.status(500).send({ error: err })
                                } else {
                                    const newRecordId = (newDoc as { _id?: string })?._id;
                                    let wallet_l;
                                    if (process.env.WALLET_API.length > 0) {
                                        wallet_l = await walletOrder(newRecordId, user_id, amount, 'TON', description, '', return_url )
                                    }
                                    const responseObj = {
                                        success: true,
                                        //message: `Created order for ${req.params.amount} with id ${newRecordId}`,
                                        amount: amount,
                                        id: newRecordId,
                                        paylink: process.env.WALLET_API.length > 0 ? wallet_l.directPayLink : '',
                                        wallet: wallet.address.toString({ bounceable: false, testOnly: false })
                                    };
                                    if (process.env.WALLET_API.length > 0) {
                                        ordersDb.update({ _id: newRecordId }, { $set: { wallet_order_id: wallet_l.id } }, {}, function (err, numUpdated) {
                                            if (err) {
                                                console.error(err);
                                            } else {
                                                res.json(responseObj);
                                            }
                                        });
                                    } else {
                                        res.json(responseObj);
                                    }
                                }
                            });
                        } else {
                            console.log("Same Orders, price modified")
                            let foundOrders: any[] = [];
                            foundOrders = await findOrdersRecursive(ordersDb, amount);
                            while (foundOrders.length > 0) {
                                amount = parseFloat(fromNano(toNano(amount) + toNano(0.001)));
                                foundOrders = await findOrdersRecursive(ordersDb, amount);
                            }
                            const orderInfo = { 
                                status: 'new',
                                amount: amount, 
                                timestamp: Date.now(),
                                wallet_order_id: null
                            };
                            console.log("Same AMT NEW: ",amount)
                            ordersDb.insert(orderInfo, async (err, newDoc) => {
                                if (err) {
                                    res.status(500).send({ error: err })
                                } else {
                                    const newRecordId = (newDoc as { _id?: string })?._id;
                                    let wallet_l;
                                    if (process.env.WALLET_API.length > 0) {
                                        wallet_l = await walletOrder(newRecordId, user_id, amount, 'TON', description, '', return_url )
                                    }
                                    const responseObj = {
                                        success: true,
                                        //message: `Created order for ${amount} with id ${newRecordId}`,
                                        amount: amount,
                                        id: newRecordId,
                                        paylink: process.env.WALLET_API.length > 0 ? wallet_l.directPayLink : '',
                                        wallet: wallet.address.toString({ bounceable: false, testOnly: false })
                                    };
                                    if (process.env.WALLET_API.length > 0) {
                                        ordersDb.update({ _id: newRecordId }, { $set: { wallet_order_id: wallet_l.id } }, {}, function (err, numUpdated) {
                                            if (err) {
                                                console.error(err);
                                            } else {
                                                res.json(responseObj);
                                            }
                                        });
                                    } else {
                                        res.json(responseObj);
                                    }
                                }
                            });
                        }
                    });
                })
                .catch((error) => {
                    console.error('Error:', error);
                    res.status(500).send({ error: error })
                });

            
        });


        app.get('/order/', function(req, res) {
            ordersDb.find({ status: 'new' }, async (err, orders) => {
                if (err) {
                    res.status(500).send({ error: err })
                }
                if (orders.length === 0) {
                    const responseObj = {
                        success: true,
                        message: `No Open Orders!`,
                    };
                    res.json(responseObj);
                } else {
                    // List the found orders
                    console.log("Found Orders:");
                    orders.forEach((order) => {
                        console.log(`Order ID: ${order._id}, Amount: ${order.amount}, Status ${order.status}, Timestamp: ${order.timestamp}`);
                        // Add other properties as needed
                    });
                    const responseObj = {
                        success: true,
                        orders: orders,
                    };
                    res.json(responseObj);
                }
            });
        });

        app.get('/order/:orderid/', function(req, res) {
            let id: string = req.params.orderid;
            ordersDb.find({ _id: id }, async (err, orders) => {
                if (err) {
                    res.status(500).send({ error: err })
                }
                if (orders.length === 0) {
                    const responseObj = {
                        success: false,
                        message: `No such orderID`,
                    };
                    res.json(responseObj);
                } else {
                    // List the found orders
                    console.log("Order:");
                    orders.forEach((order) => {
                        console.log(`Order ID: ${order._id}, Amount: ${order.amount}, Status ${order.status}, Timestamp: ${order.timestamp}`);
                        // Add other properties as needed
                    });
                    res.json(orders);
                }
            });
        });

        app.delete('/order/:orderid/', function(req, res) {
            let id: string = req.params.orderid;
            ordersDb.remove({ _id: id }, async (err, orders) => {
                if (err) {
                    res.status(500).send({ error: err })
                }
                const responseObj = {
                    success: true,
                    message: `Delete success`,
                };
                res.json(responseObj);
            });
        });

    app.listen(port, () => console.log(`Running on port ${port}`));
    
    fetchTrans();
    setInterval(fetchTrans, 60000);

    async function fetchTrans() {
        
        console.log("Wallet balance:", fromNano(balanceNano));
        console.log("Wallet address:", wallet.address.toString({ bounceable: false, testOnly: false }));
        console.log("Daemon Fetching Transactions...");
        ordersDb.find({ status: 'new' }, async (err, orders) => {
            if (err) {
                console.log("Skip Fetching Transactions... Error.");
                return;
            }
            if (orders.length === 0) {
                console.log("Skip Fetching Transactions... No open orders.");
            } else {
                try {
                    const endpoint =
                        process.env.NETWORK === "mainnet"
                            ? "https://toncenter.com/api/v2/jsonRPC"
                            : "https://testnet.toncenter.com/api/v2/jsonRPC";
                    const httpClient = new HttpApi(endpoint, { apiKey: process.env.API_KEY });
                    const apiUrl = `https://toncenter.com/api/v2/getTransactions?address=${wallet.address}&limit=100&archival=true`;
                    let transactions;
                    try {
                        const response = await axios.get(apiUrl);
                        transactions = Object.values(response.data.result);
                    } catch (error: any) {
                        console.error('Error fetching transactions:', error.message);
                        throw error;
                    }
                    let incomingTransactions = transactions.filter(
                        (tx: any) => Object.keys(tx.out_msgs).length === 0
                    );
                    for (const transaction of incomingTransactions) {
                        const hashToMatch = transaction.transaction_id.hash;
                        transactionsDb.find({ hash: hashToMatch }, (err, trans) => {
                            if (err) {
                                console.error('Error querying the database:', err);
                                return;
                            }
                            if (trans.length === 0) {
                                console.log('Incoming Transaction:', transaction.transaction_id.hash);
                                const value = fromNano(transaction.in_msg.value);
                                const v = parseFloat(value);
                                console.log("Searching ORDER for: ", v);
                                ordersDb.find({ amount: v, status: 'new' }, (err, orders) => {
                                    if (err) {
                                        console.error("Error finding orders:", err);
                                        return;
                                    }
                                    const transInfo = { 
                                        hash: hashToMatch,
                                        timestamp: Date.now(),
                                    };
                                    if (orders.length === 0) {
                                        console.log("No orders to trans");
                                        transactionsDb.insert(transInfo, (err, newDoc) => {
                                            if (err) {
                                                console.error('Error inserting transaction into the database:', err);
                                            } else {
                                                console.log('Inserted transaction into the database:', newDoc);
                                            }
                                        });
                                    } else if (orders.length === 1) {
                                        console.log("Found order to trans");
                                        orders.forEach((doc) => {
                                            closeOrderCallback(doc._id);
                                        });
                                        const updateOptions = { multi: true };
                                        const updatedStatus = 'complete';
                                        const updateQuery = { $set: { status: updatedStatus } };
                                        const query = { amount: v, status: 'new' };
                                        ordersDb.update(query, updateQuery, updateOptions, (err, numUpdated) => {
                                            if (err) {
                                                console.error('Error updating orders in the database:', err);
                                            } else {
                                                console.log(`${numUpdated} orders updated to status: ${updatedStatus}`);
                                                transactionsDb.insert(transInfo, (err, newDoc) => {
                                                    if (err) {
                                                        console.error('Error inserting transaction into the database:', err);
                                                    } else {
                                                        console.log('Inserted transaction into the database:', newDoc);
                                                    }
                                                });
                                            }
                                        });
                                    } else {
                                        console.error("Too many new orders");
                                    }
                                });
                            }
                        });
                    }
                    
                    // Wallet API order checking...
                    if (process.env.WALLET_API.length > 0) {
                        console.log('Wallet API in use, fetching orders...');
                        const apiUrl = 'https://pay.wallet.tg/wpay/store-api/v1/order/preview';
                        orders.forEach(async (doc) => {
                            let response;
                            try {
                                response = await axios.get(apiUrl, {
                                    params: {
                                        id: doc.wallet_order_id,
                                    },
                                    headers: {
                                        'Wpay-Store-Api-Key': process.env.WALLET_API,
                                    },
                                });
                                console.log(response.data.data);
                            } catch (error) {
                                console.error(error);
                            }
                            if (response.data.data.status == 'PAID') {
                                closeOrderCallback(doc._id);
                                const updateOptions = { multi: true };
                                const updatedStatus = 'complete';
                                const updateQuery = { $set: { status: updatedStatus } };
                                const query = { amount: doc.amount, status: 'new' };
                                ordersDb.update(query, updateQuery, updateOptions, (err, numUpdated) => {
                                    if (err) {
                                        console.error('Error updating orders in the database:', err);
                                    } else {
                                        console.log(`${numUpdated} orders updated to status: ${updatedStatus}`);
                                    }
                                });
                            }
                        });
                    }
                    
                    // Abort outdated orders
                    const outdatedTimestamp = Date.now() - 60 * 60 * 1000;
                    const updatedStatus = 'aborted';
                    const updateOptions = { multi: true };
                    const updateQuery = { $set: { status: updatedStatus } };
                    const query = { status: 'new', timestamp: { $lt: outdatedTimestamp } };
                    ordersDb.find(query, (err, orders) => {
                        if (err) {
                            console.error("Error finding orders:", err);
                            return;
                        }
                        if (orders.length !== 0) {
                            orders.forEach((doc) => {
                                abortOrderCallback(doc._id);
                            });
                        }
                    });
                    ordersDb.update(query, updateQuery, updateOptions, (err, numUpdated) => {
                        if (err) {
                            console.error('Error updating orders in the database:', err);
                            return;
                        }
                        if (numUpdated > 0) {
                            console.log(`${numUpdated} orders updated to status: ${updatedStatus}`);
                        }
                    });
        
                } catch (error: any) {
                    console.error('An unexpected error occurred:', error);
                }
            }
        });
    }
}

async function walletOrder(id, user_id, amount, currency, description, data, return_url ) {
    const apiUrl = 'https://pay.wallet.tg/wpay/store-api/v1/order';
    const orderData = {
        amount: {
          currencyCode: currency,
          amount: amount,
        },
        autoConversionCurrency: 'TON',
        description: description,
        returnUrl: return_url,
        failReturnUrl: return_url,
        customData: data,
        externalId: id,
        timeoutSeconds: 3600,
        customerTelegramUserId: user_id,
    };
    try {
        const response = await axios.post(apiUrl, orderData, {
            headers: {
              'Wpay-Store-Api-Key': process.env.WALLET_API,
            },
        });
        console.log(response.data.data);
        return response.data.data;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

async function fetchTonRate(currency, retryCount = 7) {
    const apiUrl = 'https://tonapi.io/v2/rates?tokens=ton&currencies=' + currency;
    try {
        const response = await axios.get(apiUrl);
        const tonRate = response.data.rates.TON.prices[currency.toUpperCase()];
        return tonRate;
    } catch (error) {
        console.error('Error fetching TON/RUB rate:', error);
        if (retryCount > 0) {
            console.error('Retrying...');
            return new Promise(resolve => setTimeout(() => resolve(fetchTonRate(currency, retryCount - 1)), 5000));
        } else {
            console.error('Reached maximum fetchTonRate retry attempts.');
            throw new Error('Maximum fetchTonRate retry attempts reached.');
        }
    }
}

async function closeOrderCallback(id) {
    const cb = process.env.CALLBACK as string;
    const url = cb + `/order/${id}`;
    try {
        const response = await axios.post(url, { data: { id }, timeout: 5000 });
        console.log(`Order callback to status complete: ${id}`, response);
        return response.data;
    } catch (error: any) {
        console.error('Error:', error.message);
        throw error;
    }
}

async function abortOrderCallback(id) {
    const cb = process.env.CALLBACK as string;
    const url = cb + `/order/${id}`;
    try {
        const response = await axios.delete(url, { data: { id }, timeout: 5000 });
        console.log(`Order callback to status aborted: ${id}`, response);
        return response.data;
    } catch (error: any) {
        console.error('Error:', error.message);
        throw error;
    }
}

async function getWalletBalance() {
    const mnemonic = process.env.MNEMONIC as string;
    if (!mnemonic) {
        throw new Error("MNEMONIC is not defined in the environment variables");
    }
    const keyPair = await mnemonicToWalletKey(mnemonic.split(" "));
    const wallet = WalletContractV5R1.create({
        publicKey: keyPair.publicKey,  
    }); //workchain: 0,
    const client = new TonClient({
        endpoint: "https://toncenter.com/api/v2/jsonRPC",
        apiKey: process.env.API_KEY,
    });
    const walletBalance = await client.getBalance(wallet.address);
    return fromNano(walletBalance);
}

main();
