
let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let config = require('../Base/config');
let Utils = require('../Base/Utils/Utils');
let moment = require('moment');

class DepositModel{

    constructor(){
        
    }

    async getUserDepositByTxId(txid){
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select * from m_user_deposit where txid=?`;
            let res = await cnt.execQuery(sql,[txid]);
            cnt.close();
            return res;
        } catch (error) {
            console.error(error);
            throw error; 
        }
    }
    async getUnConfirmDepositListByCoinIdList(coinIdList){
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select * from m_user_deposit where coin_id in (?) and confirm_status = 0 and record_status = 1`;
            let res = await cnt.execQuery(sql,[coinIdList]);
            cnt.close();
            return res;
        } catch (error) {
            console.error(error);
            throw error; 
        }
    }
    async getDepostSumarybyCoinIdDate(coin_id,date=moment().format('YYYY-MM-DD')){
        let cnt = await DB.cluster('slave');
        try {
            let sql = `select count(distinct(user_id)) as distinct_user, count(1) as count, COALESCE(sum(trade_amount),0) as total_deposit_amount,coin_id from m_user_deposit where date(confirm_time)=? and coin_id =? `;
            let res = await cnt.execQuery(sql,[coin_id,date]);
            return res[0];
        } catch (error) {
            throw error;
        }finally {
            cnt.close();
        }
    }
    async getDepositListByTxIdList(txidList){
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select * from m_user_deposit where txid in (?)`;
            let res = await cnt.execQuery(sql,[txidList]);
            cnt.close();
            return res;
        } catch (error) {
            console.error(error);
            throw error; 
        }
    }
    /**
     * 新增充值记录 
     */
    async addUserDesposit(userId,coinId,txid,fromBlockAddr,toBlockAddr,tradeAmount,confirmCount){
        try {
            let cnt =  await DB.cluster('master');
            let serialNum = moment().format('YYYYMMDDHHmmssSSS');
            let confirmStatus = 0;
            let confirmStatusName = confirmStatus == 0 ? '未确认' : '充值成功';
            let res = cnt.edit('m_user_deposit',{
                serial_num:serialNum,
                user_id:userId,
                coin_id:coinId,
                txid:txid,
                from_block_address:fromBlockAddr,
                to_block_address:toBlockAddr,
                trade_amount:tradeAmount,
                balance_amount:0,
                confirm_count:confirmCount,
                confirm_status:confirmStatus,
                confirm_status_name:confirmStatusName
            });
            cnt.close();
            return res;
        
        } catch (error) {
            throw error;
        }
    }
    /**
     * 确认充值记录
     */
    async confirmDeposit(txid,confirmations){
        let cnt = await DB.cluster('master');
        let res = 0;
        try {
            let depositSQL = `select * from m_user_deposit where txid=?`;
            let [deposit] = await cnt.execQuery(depositSQL,[txid]);
            if(deposit && deposit.confirm_status == 0){
                let confirmStatus = 1;
                let confirmStatusName = confirmStatus == 0 ? '未确认' : '充值成功';

                let assetsSQL = `select * from m_user_assets where record_status=1 and user_id=? and coin_id=?`;
                let [assets] = await cnt.execQuery(assetsSQL,[deposit.user_id,deposit.coin_id]);
                let balanceAmount = Utils.add(assets.balance,deposit.trade_amount);
                cnt.transaction();
                //修改充值记录状态
                let updDeposit = await cnt.edit('m_user_deposit',
                    {
                        balance_amount:balanceAmount,
                        confirm_count:confirmations,
                        confirm_status:confirmStatus,
                        confirm_status_name:confirmStatusName,
                        confirm_time: moment().format('YYYY-MM-DD HH:mm:ss')
                    },
                    {
                        txid:txid,
                        confirm_status:0,
                    }
                );
                console.log(updDeposit.affectedRows,'updDeposit.affectedRows')
                if(updDeposit.affectedRows){
                    //增加用户资产
                    let updAssets = await cnt.execQuery(`update m_user_assets set balance = balance + ? , available = available + ? 
                    where user_id = ? and coin_id = ?`,[deposit.trade_amount,deposit.trade_amount,deposit.user_id,deposit.coin_id]);
                    console.log(updAssets.affectedRows,'updAssets.affectedRows');
                    if(updAssets.affectedRows){
                        let [coin] = await cnt.execQuery("select * from m_coin where record_status=1 and coin_id = ?",deposit.coin_id);
                        //增加用户资产日志 
                        let addAssetsLog = await cnt.edit('m_user_assets_log',{
                            serial_num:deposit.serial_num,
                            user_id:deposit.user_id,
                            coin_id:deposit.coin_id,
                            coin_unit:coin.coin_unit,
                            trade_amount:deposit.trade_amount,
                            balance_amount:balanceAmount,
                            in_out_type:1,
                            user_assets_log_type_id:1,
                            user_assets_log_type_name:'充值'
                        });
                        console.log(addAssetsLog.affectedRows,'addAssetsLog.affectedRows');
                        if(addAssetsLog.affectedRows){
                            cnt.commit();
                            console.log('-----------提交了------')
                            res = 1;
                            let cache = await Cache.init(config.cacheDB.users);
                            let ckey = config.cacheKey.User_Assets + deposit.user_id;

                            if(await cache.exists(ckey)){
                                let sql = `select user_assets_id,a.user_id,a.coin_id,b.coin_name,b.is_enable_deposit,b.is_enable_withdraw,b.is_enable_transfer,a.block_address,a.balance,a.available,a.frozen,a.loan 
                                from m_user_assets as a LEFT JOIN m_coin as b on a.coin_id = b.coin_id
                                where a.record_status=1 and a.user_id = ? order by b.order_by_num asc  `;
                                let res = await cnt.execQuery(sql,deposit.user_id);
                                await Promise.all(res.map(async (row)=>{
                                    return cache.hset(ckey,row.coin_id,row);
                                }));
                                await cache.expire(ckey,7200);
                            }
                            cache.close();
                        }else{
                            cnt.rollback();
                        }
                    }else{
                        cnt.rollback();
                    }
                }else{
                    cnt.rollback();
                }
            }
        } catch (error) {
            console.error(error);
            cnt.rollback();
            throw error; 
        } finally{
            cnt.close();
        }
        return res;
    }
}

module.exports = new DepositModel();