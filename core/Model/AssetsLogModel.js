
let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let config = require('../Base/config');
let Utils = require('../Base/Utils/Utils');
let moment = require('moment');

class AssetsLogModel{

    constructor(){
        
    }
    /**
     * 新增充值记录 
     */
    async addUserAssetsLog(serial_num,user_id,coin_id,coin_unit,trade_amount,balance_amount,in_out_type,user_assets_log_type_id,user_assets_log_type_name){
        try {
            let cnt =  await DB.cluster('master');
            let res = await cnt.edit('m_user_assets_log',{
                serial_num:serial_num,
                user_id:user_id,
                coin_id:coin_id,
                coin_unit:coin_unit,
                trade_amount:trade_amount,
                balance_amount:balance_amount,
                in_out_type:in_out_type,
                user_assets_log_type_id:user_assets_log_type_id,
                user_assets_log_type_name:user_assets_log_type_name
            });
            cnt.close();
            return res;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new AssetsLogModel();