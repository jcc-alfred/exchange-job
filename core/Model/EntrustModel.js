let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let config = require('../Base/config');
let Utils = require('../Base/Utils/Utils');
let moment = require('moment');
class EntrustModel {

    constructor() {

    }

    async getLastOrder(coinExchangeID = null) {
        let cnt = await DB.cluster('slaves');
        try {
            if (coinExchangeID) {
                let sql = 'select * from m_order where coin_exchange_id=? order by order_id desc limit 1';
                let res = await cnt.execQuery(sql, coinExchangeID);
                if (res) {
                    return res[0]
                } else {
                    return null
                }
            } else {
                let sql = 'select * from m_order where order_id in (select max(order_id) from m_order where  create_time >= (now() - interval 24 hour) group by coin_exchange_id)';
                let res = await cnt.execQuery(sql);
                if (res) {
                    return res
                } else {
                    return null
                }
            }

        } catch (e) {
            console.error(e);
        } finally {
            await cnt.close();
        }
    }
}
module.exports = new EntrustModel();