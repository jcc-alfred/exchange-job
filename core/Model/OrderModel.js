let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let config = require('../Base/config');
let SystemModel = require('./SystemModel');
let moment = require('moment');

class OrderModel {


    constructor() {

    }

    async getUnProcBonusList() {
        try {
            let cnt = await DB.cluster('slave');
            let res = await cnt.execQuery(`select a.coin_exchange_id,b.coin_id,b.exchange_coin_id,buy_user_id,sell_user_id,SUM(buy_fees) as buy_fees,SUM(sell_fees) as sell_fees,MAX(order_id) as max_order_id
            from m_order as a left join m_coin_exchange as b on a.coin_exchange_id = b.coin_exchange_id
            where proc_bonus_status = 1
            group by a.coin_exchange_id,buy_user_id,sell_user_id`);
            cnt.close();

            return res;

        } catch (error) {
            throw error;
        }
    }

    async getPre24HPriceByCoinExchangeId(coin_exchange_id) {
        try {
            let cnt = await DB.cluster('slave');
            let sql = `SELECT AVG(trade_price) as trade_price FROM m_order where coin_exchange_id = ? and create_time >= ((SELECT create_time from m_order where coin_exchange_id = ? ORDER BY order_id desc LIMIT 1) - interval 24 hour) `;
            let res = await cnt.execReader(sql, [coin_exchange_id, coin_exchange_id]);
            cnt.close();

            return res.trade_price;

        } catch (error) {
            throw error;
        }
    }

    /**
     * 新增记录
     */
    async addExBonus(userId, coinId, tradeAmount, referral_path) {
        try {
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

            if (isEnableExMining && L0Rate > 0) {
                //奖励自己
                this.doExBonus(userId, coinId, tradeAmount * L0Rate, 0);
            }
            if (referral_path && isEnableExMining) {
                let refUsers = referral_path.substr(1).split('/').reverse();
                let L1UserId = refUsers.length > 0 && refUsers[0] && Untils.isInt(refUsers[0]) ? refUsers[0] : 0;
                let L2UserId = refUsers.length > 1 && refUsers[1] && Untils.isInt(refUsers[1]) ? refUsers[1] : 0;
                let L3UserId = refUsers.length > 2 && refUsers[2] && Untils.isInt(refUsers[2]) ? refUsers[2] : 0;
                //奖励1级
                if (exMiningLevel > 0 && L1Rate > 0 && L1UserId > 0) {
                    this.doExBonus(L1UserId, coinId, tradeAmount * L1Rate, 1);
                }
                //奖励2级
                if (exMiningLevel > 1 && L2Rate > 0 && L2UserId > 0) {
                    this.doExBonus(L2UserId, coinId, tradeAmount * L2Rate, 2);
                }
                //奖励3级
                if (exMiningLevel > 2 && L3Rate > 0 && L3UserId > 0) {
                    this.doExBonus(L3UserId, coinId, tradeAmount * L3Rate, 3);
                }
            }

        } catch (error) {
            throw error;
        }
    }

    async doExBonus(userId, coinId, tradeAmount, level) {
        let cnt = await DB.cluster('master');
        try {
            let serialNum = moment().format('YYYYMMDDHHmmssSSS');
            let [assets] = await cnt.execQuery(`select * from m_user_assets where record_status=1 and user_id=? and coin_id=?`, [userId, coinId]);
            let balanceAmount = Utils.add(assets.balance, tradeAmount);
            cnt.transaction();
            //增加用户资产
            let updAssets = await cnt.execQuery(`update m_user_assets set balance = balance + ? , available = available + ? 
            where user_id = ? and coin_id = ?`, [tradeAmount, tradeAmount, userId, coinId]);

            let [coin] = await cnt.execQuery("select * from m_coin where record_status=1 and coin_id = ?", coinId);
            let user_assets_log_type_id = level > 0 ? 6 : 7; //6 推荐奖励 7 交易奖励
            let user_assets_log_type_name = level > 0 ? '推荐奖励' : '交易奖励';
            //增加用户资产日志 
            let addAssetsLog = await cnt.edit('m_user_assets_log', {
                serial_num: serialNum,
                user_id: userId,
                coin_id: coinId,
                coin_unit: coin.coin_unit,
                trade_amount: tradeAmount,
                balance_amount: balanceAmount,
                in_out_type: 1,
                user_assets_log_type_id: user_assets_log_type_id,
                user_assets_log_type_name: user_assets_log_type_name
            });
            let user_bonus_type_id = level > 0 ? 2 : 3; //2 推荐奖励 3 交易奖励
            let user_bonus_type_name = level > 0 ? '推荐奖励' : '交易奖励'; //2 推荐奖励 3 交易奖励
            //增加用户奖励记录 
            let addUserBonus = await cnt.edit('m_user_bonus', {
                user_id: userId,
                user_bonus_type_id: user_bonus_type_id,
                user_bonus_type_name: user_bonus_type_name,
                coin_id: coinId,
                coin_unit: coin.coin_unit,
                trade_amount: tradeAmount,
                order_id: 0,
                referral_level: level
            });
            cnt.commit();
            let cache = await Cache.init(config.cacheDB.users);
            let ckey = config.cacheKey.User_Assets + userId;
            if (await cache.exists(ckey)) {
                await cache.del(ckey)
            }
            cache.close();
        } catch (error) {
            console.error(error);
            cnt.rollback();
            throw error;
        } finally {
            cnt.close();
        }
    }

    async updateOrderByMaxOrderId(max_order_id) {
        try {
            let cnt = await DB.cluster('master');
            let sql = `update m_order set proc_bonus_status = 2 where order_id <= ?`;
            let res = cnt.execQuery(sql, max_order_id);
            cnt.close();
            return res;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }
}

module.exports = new OrderModel();