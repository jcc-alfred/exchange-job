
let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let config = require('../Base/config')

class AssetsModel{

    constructor(){
        
    }
    async getEmptyAssetsByCoinId(coinId,page,pageSize=10){
        try{
            
            let sql = "select * from m_user_assets where coin_id = ? and (block_address = '' or block_address is null) and record_status = 1";
            let cnt = await DB.cluster('slave');
            let res = cnt.page(sql,coinId,page,pageSize);

            cnt.close();
            return res;

        }
        catch(error){
            throw error;
        }
    }
    async getNoEmptyAssetsByCoinId(coinId,page,pageSize=10){
        try{
            
            let sql = "select * from m_user_assets where coin_id = ? and (block_address <> '' and block_address is not null) and record_status = 1";
            let cnt = await DB.cluster('slave');
            let res = cnt.page(sql,coinId,page,pageSize);
            cnt.close();
            return res;
        }
        catch(error){
            throw error;
        }
    }
    async getUserNoEmptyAssetsCountByCoinId(coinId){
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select count(1) from m_user_assets where record_status=1 and coin_id=? and (block_address <> '' and block_address is not null)`;
            let res = await cnt.execScalar(sql,[coinId]);
            cnt.close();
            return res;
        } catch (error) {
            throw error; 
        }
    }
    async setBlockAddress({userId,coinId,blockAddress,privateKey}){
        try {
            let cnt = await DB.cluster('master');
            let result = await cnt.edit('m_user_assets',
                {
                    block_address:blockAddress,
                    private_key:privateKey
                },
                {
                    user_id:userId,
                    coin_id:coinId,
                }
            );
            cnt.close();
            if(result.affectedRows){
                let cache = await Cache.init(config.cacheDB.users);
                let ckey = config.cacheKey.User_Assets + userId;

                if(await cache.exists(ckey)){
                    // let cnt = await DB.cluster('salve');
                    // let res = await cnt.execQuery('select user_assets_id,user_id,coin_id,block_address,balance,available,frozen,loan from m_user_assets where record_status=1 and user_id = ? ',userId);
                    // cnt.close();
                    // await Promise.all(res.map(async (row)=>{
                    //     return cache.hset(ckey,row.coin_id,row);
                    // }));
                    // await cache.expire(ckey,7200);
                    cache.del(ckey);
                }
                cache.close();
            }

        } catch (error) {
            throw error
        }
    }

    async getEmptyAddrUserCountByCoinId(coinId){
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select count(1) from m_user_assets where record_status=1 and coin_id=?  and (block_address = '' or block_address is null)`;
            let res = await cnt.execScalar(sql,[coinId]);
            cnt.close();
            return res;
        } catch (error) {
            throw error; 
        }
    }
    async getUserCountByCoinId(coinId){
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select count(1) from m_user_assets where record_status=1 and coin_id=?`;
            let res = await cnt.execScalar(sql,[coinId]);
            cnt.close();
            return res;
        } catch (error) {
            throw error; 
        }
    }
    async getUserAssetsByUserIdCoinId(userId,coinId){
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select * from m_user_assets where record_status=1 and user_id=? and coin_id=?`;
            let res = await cnt.execQuery(sql,[userId,coinId]);
            cnt.close();
            return res;
        } catch (error) {
            throw error; 
        }
    }
    async getUserAssetsByBlockAddrListCoinId(blockAddressList,coinId){
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select * from m_user_assets where record_status=1 and block_address in (?) and coin_id=?`;
            let res = await cnt.execQuery(sql,[blockAddressList,coinId]);
            cnt.close();
            return res;
        } catch (error) {
            throw error; 
        }
    }
    async getUserAssetsSummary(){
        let cnt = await DB.cluster('slave');
        try {
            let sql = `select * from 
                    (select coin_id, round(sum(balance),1) as total_assets ,
                      count(distinct user_id) as distinct_user 
                      from m_user_assets 
                      where user_id not in (2,9,91) and balance >0 group by  coin_id) a
                      left join 
                      (select coin_id, coin_name from m_coin)b 
                      on b.coin_id = a.coin_id;`;
            let res = await cnt.execQuery(sql);
            return res;
        } catch (error) {
            throw error;
        }finally {
            cnt.close();
        }
    }
    async getUserCountByUserIdCoinId(userId,coinId){
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select count(1) from m_user_assets where record_status=1 and user_id=? and coin_id=?`;
            let res = await cnt.execScalar(sql,[userId,coinId]);
            cnt.close();
            return res;
        } catch (error) {
            throw error; 
        }
    }
    async insertUserAssets(userList,coin_id){
        try {
            let cnt =  await DB.cluster('master');
            
            let res = await Promise.all(userList.map((user)=>{
                return cnt.edit('m_user_assets',{
                    user_id:user.user_id,
                    coin_id:coin_id,
                    block_address:'',
                    private_key:'',
                    balance:0,
                    available:0,
                    frozen:0,
                    loan:0,
                })
            }));
            
            cnt.close();
            return res;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new AssetsModel();