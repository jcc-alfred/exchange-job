
let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let config = require('../Base/config')

class CoinAggregateModel{

    constructor(){
        
    }

    async getCoinAggregateByTxId(txId){
        try {
            let cnt = await DB.cluster('slave');
            let sql = `select * from m_coin_aggregate where txid=?`;
            let res = await cnt.execQuery(sql,[txId]);
            cnt.close();
            return res;
        } catch (error) {
            console.error(error);
            throw error; 
        }
    }
    async addCoinAggregate(txid,coinId,fromBlockAddr,toBlockAddr,tradeAmount,comments){
        try {
            let cnt =  await DB.cluster('master');
            let res = cnt.edit('m_coin_aggregate',{
                txid:txid,
                coin_id:coinId,
                from_block_address:fromBlockAddr,
                to_block_address:toBlockAddr,
                trade_amount:tradeAmount,
                comments:comments
            });
            cnt.close();
            return res;
        
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new CoinAggregateModel();