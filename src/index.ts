import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express'
import { HttpApi, WalletContractV4, TonClient, fromNano, toNano } from "@ton/ton";
import { mnemonicToWalletKey } from "@ton/crypto";
import Datastore from 'nedb';
import axios from 'axios';
import fs from 'fs';

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

const app = express();
app.use(express.json());
const port = 5000;

//logger


const logFilePath = './data/app.log';

// Save the original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleDebug = console.debug;

// Create a writable stream to the log file
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Override console.log to log to both console and file
console.log = (...args) => {
  originalConsoleLog(...args);
  logStream.write(`[LOG] ${new Date().toISOString()} ${args.join(' ')}\n`);
};

// Override console.error to log to both console and file
console.error = (...args) => {
  originalConsoleError(...args);
  logStream.write(`[ERROR] ${new Date().toISOString()} ${args.join(' ')}\n`);
};

// Override console.warn to log to both console and file
console.warn = (...args) => {
  originalConsoleWarn(...args);
  logStream.write(`[WARNING] ${new Date().toISOString()} ${args.join(' ')}\n`);
};

// Override console.debug to log to both console and file
console.debug = (...args) => {
  originalConsoleDebug(...args);
  logStream.write(`[DEBUG] ${new Date().toISOString()} ${args.join(' ')}\n`);
};


//logger

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
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });

    app.post('/order/', async function(req, res) {
        
        const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });

        let amount: number = parseFloat(parseFloat(req.body.amount).toFixed(3));

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
                };
                ordersDb.insert(orderInfo, (err, newDoc) => {
                    if (err) {
                        res.status(500).send({ error: err })
                    } else {
                        const newRecordId = (newDoc as { _id?: string })?._id;
                        const responseObj = {
                            success: true,
                            //message: `Created order for ${req.params.amount} with id ${newRecordId}`,
                            amount: amount,
                            id: newRecordId,
                            wallet: wallet.address.toString({ testOnly: true })
                        };
                        res.json(responseObj);
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
                };
                console.log("Same AMT NEW: ",amount)
                ordersDb.insert(orderInfo, (err, newDoc) => {
                    if (err) {
                        res.status(500).send({ error: err })
                    } else {
                        const newRecordId = (newDoc as { _id?: string })?._id;
                        const responseObj = {
                            success: true,
                            //message: `Created order for ${amount} with id ${newRecordId}`,
                            amount: amount,
                            id: newRecordId,
                            wallet: wallet.address.toString({ testOnly: true })
                        };
                        res.json(responseObj);
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

    app.post('/order/:currency/', async function(req, res) {
        const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
        console.log(`TON to ${req.params.currency} ORDER: `, req.body);
        let amount: number = parseFloat(req.body.amount);
        let currency: string = req.params.currency;
        fetchTonRate(currency)
            .then((tonRate) => {
                console.log(`TON to RUB rate: ${tonRate}`);
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
                        };
                        ordersDb.insert(orderInfo, (err, newDoc) => {
                            if (err) {
                                res.status(500).send({ error: err })
                            } else {
                                const newRecordId = (newDoc as { _id?: string })?._id;
                                const responseObj = {
                                    success: true,
                                    //message: `Created order for ${req.params.amount} with id ${newRecordId}`,
                                    amount: amount,
                                    id: newRecordId,
                                    wallet: wallet.address.toString({ testOnly: true })
                                };
                                res.json(responseObj);
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
                        };
                        console.log("Same AMT NEW: ",amount)
                        ordersDb.insert(orderInfo, (err, newDoc) => {
                            if (err) {
                                res.status(500).send({ error: err })
                            } else {
                                const newRecordId = (newDoc as { _id?: string })?._id;
                                const responseObj = {
                                    success: true,
                                    //message: `Created order for ${amount} with id ${newRecordId}`,
                                    amount: amount,
                                    id: newRecordId,
                                    wallet: wallet.address.toString({ testOnly: true })
                                };
                                res.json(responseObj);
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
        const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
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
        const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
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
        const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
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
    setInterval(fetchTrans,60000)

    async function fetchTrans() {
        console.log("Daemon Fetching Transactions...");
        const transactionsDb = new Datastore({ filename: './data/transactions.db', autoload: true });
        const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
        //FETCH TRANSACTIONS
        ordersDb.find({ status: 'new' }, async (err, orders) => {
            if (err) {
                console.log("Skip Fetching Transactions... Error.");
            }
            if (orders.length === 0) {
                console.log("Skip Fetching Transactions... No open orders.");
            } else {


                try {

                    const endpoint =
                        process.env.NETWORK === "mainnet"
                        ? "https://toncenter.com/api/v2/jsonRPC"
                        : "https://testnet.toncenter.com/api/v2/jsonRPC";
                    const httpClient = new HttpApi(
                        endpoint,
                        { apiKey: process.env.API_KEY }
                    );
                    const transactions = await httpClient.getTransactions(wallet.address, {
                        limit: 100,
                    });
                    let incomingTransactions = transactions.filter(
                        (tx) => Object.keys(tx.out_msgs).length === 0
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
                                // No matching transactions found, insert it
                                const value = fromNano(transaction.in_msg.value);
                                const v = parseFloat(value);
                                console.log("Searching ORDER for: ", v)
                                ordersDb.find({ amount: v, status: 'new' }, (err, orders) => {
                                    if (err) {
                                        // Handle error
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
                                        // List the found orders
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
                            } else {
                                //console.log('Transaction already parsed');
                            }
                        });
                    }
                    //ABORT OUTDATED ORDERS
                    const outdatedTimestamp = Date.now() - 60 * 60 * 1000; // One hour ago
                    const updatedStatus = 'aborted';
                    const updateOptions = { multi: true };
                    const updateQuery = { $set: { status: updatedStatus } };
                    const query = { status: 'new', timestamp: { $lt: outdatedTimestamp } };
                    ordersDb.find(query, (err, orders) => {
                        if (err) {
                            // Handle error
                            console.error("Error finding orders:", err);
                            return;
                        }
                        if (orders.length != 0) {
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
        
                } catch (error) {
                    console.error('An unexpected error occurred:', error);
                    // Handle the error as needed (e.g., log, retry, etc.)
                }


            }
        });
        


    }
}

// async function fetchTonToRubbleRate() {
//     const apiUrl = 'https://tonapi.io/v2/rates?tokens=ton&currencies=rub';

//     try {
//         const response = await axios.get(apiUrl);
//         const tonToRubbleRate = response.data.rates.TON.prices.RUB;
//         return tonToRubbleRate;
//     } catch (error) {
//         console.error('Error fetching TON/RUB rate:', error);
//         throw error;
//     }
// }

async function fetchTonRate(currency) {
    const apiUrl = 'https://tonapi.io/v2/rates?tokens=ton&currencies=' + currency;

    try {
        const response = await axios.get(apiUrl);
        const tonRate = response.data.rates.TON.prices[currency.toUpperCase()];
        return tonRate;
    } catch (error) {
        console.error('Error fetching TON/RUB rate:', error);
        throw error;
    }
}

async function closeOrderCallback(id) {
    const cb = process.env.CALLBACK as string;
    const url = cb + `/order/${id}`;

    try {
        const response = await axios.post(url, { data: { id }, timeout: 5000 });
        console.log(`Order callback to status complete: ${id}`);
        return response.data;
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

async function abortOrderCallback(id) {
    const cb = process.env.CALLBACK as string;
    const url = cb + `/order/${id}`;

    try {
        const response = await axios.delete(url, { data: { id }, timeout: 5000 });
        console.log(`Order callback to status aborted: ${id}`);
        return response.data;
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

main();