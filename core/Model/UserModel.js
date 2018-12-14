let config = require('../Base/config');
let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let MQ = require('../Base/Data/MQ');
let UserAlertModel = require('./UserAlertModel');

class UserModel {

    constructor() {

    }

    async getUserCount() {
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select count(1) from m_user where record_status=1`
            let res = cnt.execScalar(sql)
            cnt.close();
            return res;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async getUserList(page, pageSize = 10) {
        try {

            let sql = "select * from m_user where record_status=1";
            let cnt = await DB.cluster('slave');
            let res = cnt.page(sql, '', page, pageSize);

            cnt.close();
            return res;

        }
        catch (error) {
            throw error;
        }
    }

    async getUserById(id, refresh = false) {
        try {

            let cache = await Cache.init(config.cacheDB.users);
            if (await cache.exists(config.cacheKey.Users + id) && !refresh) {
                return cache.get(config.cacheKey.Users + id);
            }

            let cnt = await DB.cluster('slave');
            let sql = `select * from m_user where record_status=1 and user_id = ? `
            let res = await cnt.execReader(sql, [id])
            cnt.close();

            if (res) {

                await cache.set(config.cacheKey.Users + res.user_id, res, 3600);
                cache.close();
            }


            return res;
        } catch (error) {
            console.error(error)
            throw error;
        }
    }

    async getUserByIdNoCache(id) {
        try {

            let cnt = await DB.cluster('slave');
            let sql = `select * from m_user where record_status=1 and user_id = ? `
            let res = await cnt.execReader(sql, [id])
            cnt.close();
            return res;
        } catch (error) {
            console.error(error)
            throw error;
        }
    }

    async isOpenAlert(userId, type) {
        try {
            let cache = await Cache.init(config.cacheDB.users)
            let ckey = config.cacheKey.User_Alert + userId;

            if (!await cache.exists(ckey)) {
                await UserAlertModel.getUserAlertByUserId(userId)
            }

            let cRes = await cache.hget(ckey, type);
            return cRes.user_alert_status == 1 ? true : false;
        } catch (error) {
            throw error;
        }
    }

    async sendAlert(userId, type, lang, amount, unit) {
        try {
            if (type === 4) {
                await Promise.all(res.map((each) => {
                    return MQ.push(config.MQKey.Send_Alert,
                        {
                            type: "phone",
                            phone_number: each.phone_number,
                            area_code: each.area_code,
                            msg: "User " + userId + " Deposite " + unit + " : " + amount
                        });
                }));
            }
            else if (type === 5) {
                await Promise.all(res.map((each) => {
                    return MQ.push(config.MQKey.Send_Alert,
                        {
                            type: "phone",
                            phone_number: each.phone_number,
                            area_code: each.area_code,
                            msg: "User " + userId + " Deposite " + unit + " : " + amount
                        });
                }));
            }

            if (!await this.isOpenAlert(userId, type)) {
                return;
            }

            let userInfo = await this.getUserById(userId);

            let send = {};
            if (config.sys.sendAlertType === 1) {
                send.type = userInfo.email ? 'email' : 'phone'
            }
            if (config.sys.sendAlertType === 2) {
                send.type = userInfo.phone_number ? 'phone' : 'email'

            }
            if (config.sys.sendAlertType === 3) {
                if (!userInfo.email) {
                    return;
                }
                send.type = 'email';
            }
            if (config.sys.sendAlertType === 4) {

                if (!userInfo.phone_number) {
                    return;
                }
                send.type = 'phone';
            }

            if (send.type == 'phone') {
                send.area_code = userInfo.area_code;
                send.phone_number = userInfo.phone_number;
            } else {
                send.email = userInfo.email
            }

            send.lang = lang || 'en-us';

            if (type == UserAlertModel.alertTypeMap.login) {
                send.msg_type_id = 2;
            }
            if (type == UserAlertModel.alertTypeMap.offsiteLogin) {
                send.msg_type_id = 3;
            }
            if (type == UserAlertModel.alertTypeMap.safeSetting) {
                send.msg_type_id = 4;
            }
            if (type == UserAlertModel.alertTypeMap.payIn) {
                send.msg_type_id = 5;
                send.amount = amount;
                send.unit = unit;
            }
            if (type == UserAlertModel.alertTypeMap.payOut) {
                send.msg_type_id = 6;
                send.amount = amount;
                send.unit = unit;
            }

            let mRes = await MQ.push(config.MQKey.Send_Alert, send);
        } catch (error) {
            throw error;
        }

    }
}

module.exports = new UserModel();