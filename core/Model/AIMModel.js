let config = require('../Base/config');
const sql = require('mssql');
let moment = require('moment');


class AIMModel {

    constructor() {
        this.config = config.mssql;
        this.pool = null
    }

    async init() {
        this.pool = await sql.connect(this.config);
        return this
    }

    async getDepositByCoinNameDay(coinName, Day) {
        try {
            let sql = `SELECT ISNULL(sum(Money), 0 ) as Money  
            FROM dbo.MemberCharge where Type = '${coinName}' and  CONVERT(VARCHAR(10), createtime, 111) ='${Day}'`;
            let res = await this.pool.request().query(sql);
            return res.recordset.length > 0 ? res.recordset[0].Money : 0;
        }
        catch (error) {
            throw error;
        }
    }


    async getDepositSummaryByCoinName(coinName) {
        try {
            let sql = `SELECT ISNULL(sum(Money), 0 ) as Money ,CONVERT(VARCHAR(10), createtime, 111) as Day  
            FROM dbo.MemberCharge where Type = '${coinName}'  group by CONVERT(VARCHAR(10), createtime, 111) order by Day desc;`;
            let res = await this.pool.request().query(sql);
            return res;
        }
        catch (error) {
            throw error;
        }
    }

    async getActiveUserSumary() {
        try {
            let sql = `select count(1) as Count,CONVERT(VARCHAR(10), createtime, 111) as Day  from dbo.member where active =1 and payActive =1 group by CONVERT(VARCHAR(10), createtime, 111) order by Day desc`;
            let res = await this.pool.request().query(sql);
            return res.recordset
        }
        catch (error) {
            throw error;
        }
    }

    async getActiveMinerSumary() {
        try {
            let day = moment().format("YYYY-MM-DD HH:mm:ss");
            let sql = `SELECT  sum(Money) as Money ,count(1) as Amount, CONVERT(VARCHAR(10), createTime, 111) as Day FROM dbo.MemberHost 
            where memberName in (select loginName from dbo.member where active =1 and payActive =1) 
            and bonusActive =0 and MoneyAll >MoneyYield and createTime < '${day}' 
            and memberName in (select memberName from dbo.memberInvest where bonusActive =0 and Type =0 and Money >0 and EndTime is not Null and endTime > '${day}') 
            group by CONVERT(VARCHAR(10), createTime, 111) order by Day desc;`;
            let res = await this.pool.request().query(sql);
            return res.recordset;
        }
        catch (error) {
            throw error;
        }
    }


    async getUserAssetSummary() {
        try {
            let sql = `SELECT  ISNULL(sum(Money), 0 ) as Money,count(1) as Count,CoinKey FROM dbo.MemberAccount where MemberName !='system' and Money >0 group by CoinKey;`;
            let res = await this.pool.request().query(sql);
            console.dir(res);
            return res.recordset;
        }
        catch (error) {
            throw error;
        }
    }
}

module.exports = new AIMModel();

async function main() {
    let a = new AIMModel();
    await a.init();
    console.dir(await a.getActiveMinerSumary());
}

main();

