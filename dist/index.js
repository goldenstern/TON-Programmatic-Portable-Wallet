var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { HttpApi, WalletContractV4, fromNano, toNano } from "@ton/ton";
import { mnemonicToWalletKey } from "@ton/crypto";
import Datastore from 'nedb';
import axios from 'axios';
import fs from 'fs';
BigInt.prototype.toJSON = function () {
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
function findOrdersRecursive(ordersDb, amount) {
    return new Promise((resolve, reject) => {
        ordersDb.find({ amount, status: 'new' }, (err, orders) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(orders);
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const mnemonic = process.env.MNEMONIC;
        const key = yield mnemonicToWalletKey(mnemonic.split(" "));
        const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
        app.post('/order/', function (req, res) {
            return __awaiter(this, void 0, void 0, function* () {
                const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
                let amount = parseFloat(parseFloat(req.body.amount).toFixed(3));
                ordersDb.find({ amount, status: 'new' }, (err, orders) => __awaiter(this, void 0, void 0, function* () {
                    if (err) {
                        res.status(500).send({ error: err });
                    }
                    if (orders.length === 0) {
                        console.log("No same Orders, price umnodified");
                        const orderInfo = {
                            status: 'new',
                            amount: amount,
                            timestamp: Date.now(),
                        };
                        ordersDb.insert(orderInfo, (err, newDoc) => {
                            if (err) {
                                res.status(500).send({ error: err });
                            }
                            else {
                                const newRecordId = newDoc === null || newDoc === void 0 ? void 0 : newDoc._id;
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
                    }
                    else {
                        console.log("Same Orders, price modified");
                        let foundOrders = [];
                        foundOrders = yield findOrdersRecursive(ordersDb, amount);
                        while (foundOrders.length > 0) {
                            amount = parseFloat(fromNano(toNano(amount) + toNano(0.001)));
                            foundOrders = yield findOrdersRecursive(ordersDb, amount);
                        }
                        const orderInfo = {
                            status: 'new',
                            amount: amount,
                            timestamp: Date.now(),
                        };
                        console.log("Same AMT NEW: ", amount);
                        ordersDb.insert(orderInfo, (err, newDoc) => {
                            if (err) {
                                res.status(500).send({ error: err });
                            }
                            else {
                                const newRecordId = newDoc === null || newDoc === void 0 ? void 0 : newDoc._id;
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
                }));
            });
        });
        app.post('/price/:currency/', function (req, res) {
            let currency = req.params.currency;
            let amount = parseFloat(req.body.amount);
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
                res.status(500).send({ error: error });
            });
        });
        app.post('/order/:currency/', function (req, res) {
            return __awaiter(this, void 0, void 0, function* () {
                const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
                console.log(`TON to ${req.params.currency} ORDER: `, req.body);
                let amount = parseFloat(req.body.amount);
                let currency = req.params.currency;
                fetchTonRate(currency)
                    .then((tonRate) => {
                    console.log(`TON to RUB rate: ${tonRate}`);
                    amount = parseFloat((amount / tonRate).toFixed(3));
                    ordersDb.find({ amount, status: 'new' }, (err, orders) => __awaiter(this, void 0, void 0, function* () {
                        if (err) {
                            res.status(500).send({ error: err });
                        }
                        if (orders.length === 0) {
                            console.log("No same Orders, price umnodified");
                            const orderInfo = {
                                status: 'new',
                                amount: amount,
                                timestamp: Date.now(),
                            };
                            ordersDb.insert(orderInfo, (err, newDoc) => {
                                if (err) {
                                    res.status(500).send({ error: err });
                                }
                                else {
                                    const newRecordId = newDoc === null || newDoc === void 0 ? void 0 : newDoc._id;
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
                        }
                        else {
                            console.log("Same Orders, price modified");
                            let foundOrders = [];
                            foundOrders = yield findOrdersRecursive(ordersDb, amount);
                            while (foundOrders.length > 0) {
                                amount = parseFloat(fromNano(toNano(amount) + toNano(0.001)));
                                foundOrders = yield findOrdersRecursive(ordersDb, amount);
                            }
                            const orderInfo = {
                                status: 'new',
                                amount: amount,
                                timestamp: Date.now(),
                            };
                            console.log("Same AMT NEW: ", amount);
                            ordersDb.insert(orderInfo, (err, newDoc) => {
                                if (err) {
                                    res.status(500).send({ error: err });
                                }
                                else {
                                    const newRecordId = newDoc === null || newDoc === void 0 ? void 0 : newDoc._id;
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
                    }));
                })
                    .catch((error) => {
                    console.error('Error:', error);
                    res.status(500).send({ error: error });
                });
            });
        });
        app.get('/order/', function (req, res) {
            const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
            ordersDb.find({ status: 'new' }, (err, orders) => __awaiter(this, void 0, void 0, function* () {
                if (err) {
                    res.status(500).send({ error: err });
                }
                if (orders.length === 0) {
                    const responseObj = {
                        success: true,
                        message: `No Open Orders!`,
                    };
                    res.json(responseObj);
                }
                else {
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
            }));
        });
        app.get('/order/:orderid/', function (req, res) {
            let id = req.params.orderid;
            const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
            ordersDb.find({ _id: id }, (err, orders) => __awaiter(this, void 0, void 0, function* () {
                if (err) {
                    res.status(500).send({ error: err });
                }
                if (orders.length === 0) {
                    const responseObj = {
                        success: false,
                        message: `No such orderID`,
                    };
                    res.json(responseObj);
                }
                else {
                    // List the found orders
                    console.log("Order:");
                    orders.forEach((order) => {
                        console.log(`Order ID: ${order._id}, Amount: ${order.amount}, Status ${order.status}, Timestamp: ${order.timestamp}`);
                        // Add other properties as needed
                    });
                    res.json(orders);
                }
            }));
        });
        app.delete('/order/:orderid/', function (req, res) {
            let id = req.params.orderid;
            const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
            ordersDb.remove({ _id: id }, (err, orders) => __awaiter(this, void 0, void 0, function* () {
                if (err) {
                    res.status(500).send({ error: err });
                }
                const responseObj = {
                    success: true,
                    message: `Delete success`,
                };
                res.json(responseObj);
            }));
        });
        app.listen(port, () => console.log(`Running on port ${port}`));
        fetchTrans();
        setInterval(fetchTrans, 60000);
        function fetchTrans() {
            return __awaiter(this, void 0, void 0, function* () {
                console.log("Daemon Fetching Transactions...");
                const transactionsDb = new Datastore({ filename: './data/transactions.db', autoload: true });
                const ordersDb = new Datastore({ filename: './data/orders.db', autoload: true });
                //FETCH TRANSACTIONS
                ordersDb.find({ status: 'new' }, (err, orders) => __awaiter(this, void 0, void 0, function* () {
                    if (err) {
                        console.log("Skip Fetching Transactions... Error.");
                    }
                    if (orders.length === 0) {
                        console.log("Skip Fetching Transactions... No open orders.");
                    }
                    else {
                        try {
                            const endpoint = process.env.NETWORK === "mainnet"
                                ? "https://toncenter.com/api/v2/jsonRPC"
                                : "https://testnet.toncenter.com/api/v2/jsonRPC";
                            const httpClient = new HttpApi(endpoint, { apiKey: process.env.API_KEY });
                            const transactions = yield httpClient.getTransactions(wallet.address, {
                                limit: 100,
                            });
                            let incomingTransactions = transactions.filter((tx) => Object.keys(tx.out_msgs).length === 0);
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
                                        console.log("Searching ORDER for: ", v);
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
                                                    }
                                                    else {
                                                        console.log('Inserted transaction into the database:', newDoc);
                                                    }
                                                });
                                            }
                                            else if (orders.length === 1) {
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
                                                    }
                                                    else {
                                                        console.log(`${numUpdated} orders updated to status: ${updatedStatus}`);
                                                        transactionsDb.insert(transInfo, (err, newDoc) => {
                                                            if (err) {
                                                                console.error('Error inserting transaction into the database:', err);
                                                            }
                                                            else {
                                                                console.log('Inserted transaction into the database:', newDoc);
                                                            }
                                                        });
                                                    }
                                                });
                                            }
                                            else {
                                                console.error("Too many new orders");
                                            }
                                        });
                                    }
                                    else {
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
                        }
                        catch (error) {
                            console.error('An unexpected error occurred:', error);
                            // Handle the error as needed (e.g., log, retry, etc.)
                        }
                    }
                }));
            });
        }
    });
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
function fetchTonRate(currency) {
    return __awaiter(this, void 0, void 0, function* () {
        const apiUrl = 'https://tonapi.io/v2/rates?tokens=ton&currencies=' + currency;
        try {
            const response = yield axios.get(apiUrl);
            const tonRate = response.data.rates.TON.prices[currency.toUpperCase()];
            return tonRate;
        }
        catch (error) {
            console.error('Error fetching TON/RUB rate:', error);
            throw error;
        }
    });
}
function closeOrderCallback(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const cb = process.env.CALLBACK;
        const url = cb + `/order/${id}`;
        try {
            const response = yield axios.post(url, { data: { id }, timeout: 5000 });
            console.log(`Order callback to status complete: ${id}`);
            return response.data;
        }
        catch (error) {
            console.error('Error:', error.message);
            throw error;
        }
    });
}
function abortOrderCallback(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const cb = process.env.CALLBACK;
        const url = cb + `/order/${id}`;
        try {
            const response = yield axios.delete(url, { data: { id }, timeout: 5000 });
            console.log(`Order callback to status aborted: ${id}`);
            return response.data;
        }
        catch (error) {
            console.error('Error:', error.message);
            throw error;
        }
    });
}
main();
