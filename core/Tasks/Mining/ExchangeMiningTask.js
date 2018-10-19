let schedule = require('node-schedule');
let _ = require('lodash');
let Utils = require('../../Base/Utils/Utils');
let CoinModel = require('../../Model/CoinModel');
let UserModel = require('../../Model/UserModel');
let OrderModel = require('../../Model/OrderModel');
let SystemModel = require('../../Model/SystemModel');

// *    *    *    *    *    *
// ┬    ┬    ┬    ┬    ┬    ┬
// │    │    │    │    │    │
// │    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
// │    │    │    │    └───── month (1 - 12)
// │    │    │    └────────── day of month (1 - 31)
// │    │    └─────────────── hour (0 - 23)
// │    └──────────────────── minute (0 - 59)
// └───────────────────────── second (0 - 59, OPTIONAL)

try {
    var rule = new schedule.RecurrenceRule();
    var times = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
    rule.hour = times;
    rule.minute = 0;

    let isRun = false;
    var job = schedule.scheduleJob(rule, async () => {

        if (isRun) {
            return;
        }
        isRun = true;
        let coinExchangeList = await CoinModel.getCoinExchangeList();
        if (!coinExchangeList) {
            isRun = false;
            return;
        }

        try {
            let orderList = await OrderModel.getUnProcBonusList();
            //1基本配置 2 客服配置 3邮件接口配置 4 短信接口配置 5 注册挖矿配置 6 交易挖矿配置
            let exMiningConfig = await SystemModel.getSysConfigByTypeId(6);
            let isEnableDividend = exMiningConfig.find((item) => {
                return item.config_key == 'isEnableDividend'
            }).config_value == '1' ? true : false;
            let DividendCoinId = parseInt(exMiningConfig.find((item) => {
                return item.config_key == 'DividendCoinId'
            }).config_value);
            let DividendRate = parseFloat(exMiningConfig.find((item) => {
                return item.config_key == 'DividendRate'
            }).config_value);
            let isEnableExMining = exMiningConfig.find((item) => {
                return item.config_key == 'isEnableExMining'
            }).config_value == '1' ? true : false;
            let exMiningLevel = parseInt(exMiningConfig.find((item) => {
                return item.config_key == 'exMiningLevel'
            }).config_value);
            let miningCoinId = parseInt(exMiningConfig.find((item) => {
                return item.config_key == 'coinId'
            }).config_value);
            let L0Rate = parseFloat(exMiningConfig.find((item) => {
                return item.config_key == 'L0Rate'
            }).config_value);
            let L1Rate = parseFloat(exMiningConfig.find((item) => {
                return item.config_key == 'L1Rate'
            }).config_value);
            let L2Rate = parseFloat(exMiningConfig.find((item) => {
                return item.config_key == 'L2Rate'
            }).config_value);
            let L3Rate = parseFloat(exMiningConfig.find((item) => {
                return item.config_key == 'L3Rate'
            }).config_value);
            let btcId = 1;
            if (!isEnableExMining) {
                isRun = false;
                return;
            }
            let orderIdList = [];
            orderList.map(async (order) => {
                try {
                    if (order.buy_fees > 0) {
                        let buyFees = 0;
                        if (order.coin_id == miningCoinId) {
                            buyFees = order.buy_fees;
                        } else {
                            let [miningCoinPair] = coinExchangeList.filter((item) => item.coin_id == order.coin_id && item.exchange_coin_id == miningCoinId);
                            let [p_miningCoinPair] = coinExchangeList.filter((item) => item.coin_id == miningCoinId && item.exchange_coin_id == order.coin_id);
                            if (miningCoinPair) {
                                let miningCoinPrice = await OrderModel.getPre24HPriceByCoinExchangeId(miningCoinPair.coin_exchange_id);
                                if (miningCoinPrice) {
                                    buyFees = Utils.div(order.buy_fees, miningCoinPrice);
                                }
                            } else if (p_miningCoinPair) {
                                let p_miningCoinPrice = await OrderModel.getPre24HPriceByCoinExchangeId(miningCoinPair.coin_exchange_id);
                                if (p_miningCoinPrice) {
                                    buyFees = Utils.mul(order.buy_fees, p_miningCoinPrice);
                                }
                            } else {
                                let btcFees = 0;
                                if (order.coin_id == btcId) {
                                    btcFees = order.buy_fees;
                                }
                                let [btcPair] = coinExchangeList.filter((item) => item.coin_id == order.coin_id && item.exchange_coin_id == btcId);
                                let [p_btcPair] = coinExchangeList.filter((item) => item.coin_id == btcId && item.exchange_coin_id == order.coin_id);
                                if (btcPair) {
                                    let btcPrice = await OrderModel.getPre24HPriceByCoinExchangeId(btcPair.coin_exchange_id);
                                    if (btcPrice) {
                                        btcFees = Utils.div(order.buy_fees, btcPrice);
                                    }
                                } else if (p_btcPair) {
                                    let p_btcPrice = await OrderModel.getPre24HPriceByCoinExchangeId(p_btcPair.coin_exchange_id);
                                    if (p_btcPrice) {
                                        btcFees = Utils.mul(order.buy_fees, p_btcPrice);
                                    }
                                } else {
                                    btcFees = 0;
                                }
                                let [btcminingCoinPair] = coinExchangeList.filter((item) => item.coin_id == btcId && item.exchange_coin_id == miningCoinId);
                                let [p_btcminingCoinPair] = coinExchangeList.filter((item) => item.coin_id == miningCoinId && item.exchange_coin_id == btcId);
                                if (btcminingCoinPair) {
                                    let btcminingCoinPrice = await OrderModel.getPre24HPriceByCoinExchangeId(btcminingCoinPair.coin_exchange_id);
                                    if (btcminingCoinPrice) {
                                        buyFees = Utils.div(btcFees, btcminingCoinPrice);
                                    }
                                } else if (p_btcminingCoinPair) {
                                    let p_btcminingCoinPrice = await OrderModel.getPre24HPriceByCoinExchangeId(p_btcminingCoinPair.coin_exchange_id);
                                    if (p_btcminingCoinPrice) {
                                        buyFees = Utils.mul(btcFees, p_btcminingCoinPrice);
                                    }
                                } else {
                                    buyFees = 0;
                                }
                            }
                        }
                        console.log('buyFees------', buyFees, '----order.buy_fees:', order.buy_fees);
                        if (buyFees > 0) {
                            let userInfo = await UserModel.getUserByIdNoCache(buy_user_id);
                            await OrderModel.addExBonus(buy_user_id, miningCoinId, buyFees, userInfo.referral_path);
                        }
                    }
                    if (order.sell_fees > 0) {
                        let sellFees = 0;
                        if (order.exchange_coin_id == miningCoinId) {
                            sellFees = order.sell_fees;
                        } else {
                            let [miningCoinPair] = coinExchangeList.filter((item) => item.coin_id == order.exchange_coin_id && item.exchange_coin_id == miningCoinId);
                            let [p_miningCoinPair] = coinExchangeList.filter((item) => item.coin_id == miningCoinId && item.exchange_coin_id == order.exchange_coin_id);
                            if (miningCoinPair) {
                                let miningCoinPrice = await OrderModel.getPre24HPriceByCoinExchangeId(miningCoinPair.coin_exchange_id);
                                if (miningCoinPrice) {
                                    sellFees = Utils.div(order.sell_fees, miningCoinPrice);
                                }
                            } else if (p_miningCoinPair) {
                                let p_miningCoinPrice = await OrderModel.getPre24HPriceByCoinExchangeId(p_miningCoinPair.coin_exchange_id);
                                if (p_miningCoinPrice) {
                                    sellFees = Utils.mul(order.sell_fees, p_miningCoinPrice);
                                }
                            } else {
                                let btcFees = 0;
                                if (order.exchange_coin_id == btcId) {
                                    btcFees = order.sell_fees;
                                }
                                let [btcPair] = coinExchangeList.filter((item) => item.coin_id == order.exchange_coin_id && item.exchange_coin_id == btcId);
                                let [p_btcPair] = coinExchangeList.filter((item) => item.coin_id == btcId && item.exchange_coin_id == order.exchange_coin_id);
                                if (btcPair) {
                                    let btcPrice = await OrderModel.getPre24HPriceByCoinExchangeId(btcPair.coin_exchange_id);
                                    if (btcPrice) {
                                        btcFees = Utils.div(order.sell_fees, btcPrice);
                                    }
                                } else if (p_btcPair) {
                                    let p_btcPrice = await OrderModel.getPre24HPriceByCoinExchangeId(p_btcPair.coin_exchange_id);
                                    if (p_btcPrice) {
                                        btcFees = Utils.mul(order.sell_fees, p_btcPrice);
                                    }
                                } else {
                                    btcFees = 0;
                                }
                                let [btcminingCoinPair] = coinExchangeList.filter((item) => item.coin_id == btcId && item.exchange_coin_id == miningCoinId);
                                let [p_btcminingCoinPair] = coinExchangeList.filter((item) => item.coin_id == miningCoinId && item.exchange_coin_id == btcId);
                                if (btcminingCoinPair) {
                                    let btcminingCoinPrice = await OrderModel.getPre24HPriceByCoinExchangeId(btcminingCoinPair.coin_exchange_id);
                                    if (btcminingCoinPrice) {
                                        sellFees = Utils.div(btcFees, btcminingCoinPrice);
                                    }
                                } else if (p_btcminingCoinPair) {
                                    let p_btcminingCoinPrice = await OrderModel.getPre24HPriceByCoinExchangeId(p_btcminingCoinPair.coin_exchange_id);
                                    if (p_btcminingCoinPrice) {
                                        sellFees = Utils.mul(btcFees, p_btcminingCoinPrice);
                                    }
                                } else {
                                    sellFees = 0;
                                }
                            }
                        }
                        console.log('sellFees-------', sellFees);
                        if (sellFees > 0) {
                            let userInfo = await UserModel.getUserByIdNoCache(sell_user_id);
                            await OrderModel.addExBonus(sell_user_id, miningCoinId, sellFees, userInfo.referral_path);
                        }
                    }
                    //orderIdList.push(order.order_id);
                }
                catch (error) {
                    console.error(error);
                }


            });

            //OrderModel.updateOrderByOrderIdList()
        } catch (error) {
            console.error(error);
        }
        isRun = false;
    });
} catch (error) {
    isRun = false;
    throw error;
}