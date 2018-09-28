
let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let config = require('../Base/config')
let moment = require('moment');

class TransferFeesLogModel{

    constructor(){
        
    }
    /**
     * 新增系统手续费记录 
     */
    async addTransferFees(transferCoinId,txid,feesCoinId,fees,comments){
        try {
            let cnt =  await DB.cluster('master');
            let res = cnt.edit('m_transfer_fees_log',{
                transfer_coin_id:transferCoinId,
                txid:txid,
                fees_coin_id:feesCoinId,
                fees:fees,
                comments:comments
            });
            cnt.close();
            return res;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new TransferFeesLogModel();