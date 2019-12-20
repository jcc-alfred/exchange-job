let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let config = require('../Base/config');
let Utils = require('../Base/Utils/Utils');
let moment = require('moment');

class WithdrawModel {

    constructor() {

    }

    async getUnProcListByCoinId(coinId, page, pageSize = 10) {
        try {
            //已审核并且未处理列表
            let sql = "select * from m_user_withdraw where coin_id = ? and confirm_status = 1 and (txid = '' or txid is null) and record_status = 1 group by to_block_address";
            let cnt = await DB.cluster('slave');
            let res = cnt.page(sql, coinId, page, pageSize);

            cnt.close();
            return res;

        }
        catch (error) {
            throw error;
        }
    }

    async getUnProcListCountByCoinId(coinId) {
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select count(1) from m_user_withdraw where coin_id=? and confirm_status = 1 and (txid = '' or txid is null) and record_status=1`;
            let res = await cnt.execScalar(sql, [coinId]);
            cnt.close();
            return res;
        } catch (error) {
            throw error;
        }
    }

    async setTxIdByCoinIdBlockAddrList(txid, coinId, blockAddrList) {
        try {
            let cnt = await DB.cluster('master');
            let res = await cnt.execQuery(`update m_user_withdraw set txid = ?
            where coin_id = ? and to_block_address in (?)`, [txid, coinId, blockAddrList]);
            cnt.close();
            return res;
        } catch (error) {
            throw error
        }
    }

    async setTxIdById(txid, userWithdrawId) {
        try {
            let cnt = await DB.cluster('master');
            let res = await cnt.execQuery(`update m_user_withdraw set txid = ?
            where user_withdraw_id = ?`, [txid, userWithdrawId]);
            cnt.close();
            return res;
        } catch (error) {
            throw error
        }
    }

    async getCoinWithdrawSumary(coin_id, date = moment().format('YYYY-MM-DD')) {
        try {
            let cnt = await DB.cluster('slave');
            let res = await cnt.execQuery(`select COALESCE(sum(submit_amount),0) as withdraw_amount, count(1) as count , count(distinct user_id) as unique_user from m_user_withdraw where coin_id = ? and txid !="" and confirm_status =2 and date(update_time)=?`, [coin_id, date]);
            cnt.close();
            return res[0];
        } catch (error) {
            throw error
        }
    }

    async getCoinWithdrawHistory(coin_id, duration = 7) {
        try {
            let cnt = await DB.cluster('slave');
            let res = await cnt.execQuery(`select sum(submit_amount) as withdraw_amount, date(update_time) as day 
            from m_user_withdraw where coin_id =? and txid !='' and create_time >= date(DATE_SUB(NOW(), INTERVAL ? DAY))  group by day order by day desc;`, [coin_id, duration]);
            cnt.close();
            return res;
        } catch (error) {
            throw error
        }
    }

    async getCoinWithdrawPending(coin_id) {
        try {
            let cnt = await DB.cluster('slave');
            let res = await cnt.execQuery(`select serial_num, user_id, coin_id ,txid as transactionID, submit_amount,confirm_status_name, create_time from m_user_withdraw where coin_id =? and confirm_status in (0,1)  `, [coin_id]);
            cnt.close();
            return res;
        } catch (error) {
            throw error
        }
    }

    async getCoinWithdrawPendingSumary(coin_id) {
        try {
            let cnt = await DB.cluster('slave');
            let res = await cnt.execQuery(`select count(distinct(user_id)) as user, count(1) as total_withdraw_request, sum(submit_amount) as withdraw_amount from m_user_withdraw where coin_id =? and txid='' and confirm_status in (0,1)`, [coin_id]);
            cnt.close();
            return res[0];
        } catch (error) {
            throw error
        }
    }

    async getUnConfirmWithdrawListByCoinIdList(coinIdList) {
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select * from m_user_withdraw where coin_id in (?) and confirm_status = 1 and txid != '' and txid is not null and record_status = 1`;
            let res = await cnt.execQuery(sql, [coinIdList]);
            cnt.close();
            return res;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async confirmWithdraw(txid, confirmations) {
        try {
            let cnt = await DB.cluster('master');
            let confirmStatus = 2;
            let confirmStatusName = '提现成功';
            //修改提现记录状态
            let res = cnt.edit('m_user_withdraw',
                {
                    confirm_count: confirmations,
                    confirm_status: confirmStatus,
                    confirm_status_name: confirmStatusName,
                    confirm_time: moment().format('YYYY-MM-DD HH:mm:ss')
                },
                {
                    txid: txid,
                    confirm_status: 1,
                }
            );
            cnt.close();
            return res;
        } catch (error) {
            throw error
        }
    }

    async failWithdraw(withdraw) {
        let cnt = await DB.cluster('master');
        try {
            let confirmStatus = 3;
            let confirmStatusName = '提现失败';
            await cnt.transaction();
            //修改提现记录状态
            let res = await cnt.edit('m_user_withdraw',
                {
                    confirm_status: confirmStatus,
                    confirm_status_name: confirmStatusName,
                    confirm_time: moment().format('YYYY-MM-DD HH:mm:ss')
                },
                {
                    user_withdraw_id: withdraw.user_withdraw_id
                }
            );
            let updAssets = await cnt.execQuery(`update m_user_assets set balance = balance + ? , available = available + ? 
                where user_id = ? and coin_id = ?`, [withdraw.submit_amount, withdraw.submit_amount, withdraw.user_id, withdraw.coin_id]);
            if (res.affectedRows && updAssets.affectedRows) {
                await cnt.commit();
                return true
            } else {
                await cnt.rollback();
                return false
            }
        } catch (error) {
            throw error
        }
    }

    /**
     * 内部转账
     */
    async interTransfer(userWithdrawId, toUserId) {
        let cnt = await DB.cluster('master');
        ;
        let res = 0;
        try {
            let withdrawSQL = `select * from m_user_withdraw where user_withdraw_id=?`;
            let [withdraw] = await cnt.execQuery(withdrawSQL, [userWithdrawId]);
            if (withdraw && withdraw.confirm_status == 1) {
                let assetsSQL = `select * from m_user_assets where record_status=1 and user_id=? and coin_id=?`;
                let [assets] = await cnt.execQuery(assetsSQL, [toUserId, withdraw.coin_id]);
                let balanceAmount = Utils.add(assets.balance, withdraw.trade_amount);

                cnt.transaction();

                //修改提现记录状态
                let confirmStatus = 2;
                let confirmStatusName = '提现成功';
                let updWithdraw = await cnt.edit('m_user_withdraw',
                    {
                        txid: 'interTransfer',
                        confirm_count: 88,
                        confirm_status: confirmStatus,
                        confirm_status_name: confirmStatusName,
                        confirm_time: moment().format('YYYY-MM-DD HH:mm:ss'),
                        comments: 'interTransfer'
                    },
                    {
                        user_withdraw_id: userWithdrawId,
                        confirm_status: 1,
                    }
                );

                //增加提现用户的资产日志 
                let [coin] = await cnt.execQuery("select * from m_coin where record_status=1 and coin_id = ?", withdraw.coin_id);
                let addWithdrawUserAssetsLog = await cnt.edit('m_user_assets_log', {
                    serial_num: withdraw.serial_num,
                    user_id: withdraw.user_id,
                    coin_id: withdraw.coin_id,
                    coin_unit: coin.coin_unit,
                    trade_amount: withdraw.submit_amount,
                    balance_amount: withdraw.balance_amount,
                    in_out_type: 2,
                    user_assets_log_type_id: 2,
                    user_assets_log_type_name: '提现'
                });

                //增加充值记录
                confirmStatus = 1;
                confirmStatusName = confirmStatus == 0 ? '未确认' : '充值成功';
                let addDeposit = await cnt.edit('m_user_deposit', {
                    serial_num: withdraw.serial_num,
                    user_id: toUserId,
                    coin_id: withdraw.coin_id,
                    txid: 'interTransfer',
                    from_block_address: '',
                    to_block_address: withdraw.to_block_address,
                    trade_amount: withdraw.trade_amount,
                    balance_amount: balanceAmount,
                    confirm_count: 88,
                    confirm_time: moment().format('YYYY-MM-DD HH:mm:ss'),
                    confirm_status: confirmStatus,
                    confirm_status_name: confirmStatusName,
                    comments: 'interTransfer:' + userWithdrawId
                });
                //增加用户资产
                let updAssets = await cnt.execQuery(`update m_user_assets set balance = balance + ? , available = available + ? 
                where user_id = ? and coin_id = ?`, [withdraw.trade_amount, withdraw.trade_amount, toUserId, withdraw.coin_id]);
                console.log(updAssets.affectedRows, 'updAssets.affectedRows')

                //增加用户资产日志 
                //let [coin] = await cnt.execQuery("select * from m_coin where record_status=1 and coin_id = ?",withdraw.coin_id);
                let addAssetsLog = await cnt.edit('m_user_assets_log', {
                    serial_num: withdraw.serial_num,
                    user_id: toUserId,
                    coin_id: withdraw.coin_id,
                    coin_unit: coin.coin_unit,
                    trade_amount: withdraw.trade_amount,
                    balance_amount: balanceAmount,
                    in_out_type: 1,
                    user_assets_log_type_id: 1,
                    user_assets_log_type_name: '充值'
                });
                console.log(addAssetsLog.affectedRows, 'addAssetsLog.affectedRows')
                cnt.commit();
                console.log('-----------提交了------')
                res = 1;
                let cache = await Cache.init(config.cacheDB.users);
                let ckey = config.cacheKey.User_Assets + toUserId;

                if (await cache.exists(ckey)) {
                    let sql = `select user_assets_id,a.user_id,a.coin_id,b.coin_name,b.is_enable_deposit,b.is_enable_withdraw,b.is_enable_transfer,a.block_address,a.balance,a.available,a.frozen,a.loan 
                                from m_user_assets as a LEFT JOIN m_coin as b on a.coin_id = b.coin_id
                                where a.record_status=1 and a.user_id = ? order by b.order_by_num asc  `
                    let res = await cnt.execQuery(sql, toUserId);
                    await Promise.all(res.map(async (row) => {
                        return cache.hset(ckey, row.coin_id, row);
                    }));
                    await cache.expire(ckey, 7200);
                }
                cache.close();
            }
        } catch (error) {
            console.error(error);
            cnt.rollback();
            throw error;
        } finally {
            cnt.close();
        }
        return res;
    }
}

module.exports = new WithdrawModel();