const config = {
    socketDomain: 'http://54.169.107.53:5000/',
    coinmarket_api:'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest',
    coinmarket_secret:'c236b6e8-ede0-40a8-9a66-e60a039aff80',
    currency_api: 'https://openexchangerates.org/api/latest.json',
    currency_app_id:'e1a28f4ff94b410787a1a3e581dc468c',
    report_emails:['jie.xiao@gtdollar.com'],

    Sys_Notifications:[
        {
            area_code:"65",
            phone_number:"87140718"
        }
    ],
    sys:{
        domain:'www.asiaedx.com',     //域名
        ipRegisterMaxNum:100,       //IP注册最大次数
        loginPassRetryNum:5,        //密码输入错误重试次数
        sendMsgRetryNum:5,          //队列 向手机邮箱发送放心消息失败重试次数
        codeExpired:5,              //验证码过期时间 分钟
        codeSendIntervalTime:60,     // 重复发送间隔不得超过60秒
        sendAlertType:1,            // 1 优先邮件 2 优先短信 3只发邮件 4只发短信
        cyptoKey:'cyptopass'
    },

    token:{
        secret:'Melt@998',
        expire_Web:720000,
        expire_APP:'7d'
    },


    DB: {
        master:{
            host: '54.169.107.53',
            user: 'root',
            password: 'gtdollar',
            database: 'MeltEx', // 前面建的user表位于这个数据库中
            port: 3306,
            connectionLimit:100,
        },
        slaves:[{
            host: '54.169.107.53',
            user: 'root',
            password: 'gtollar',
            database: 'MeltEx', // 前面建的user表位于这个数据库中
            port: 3306,
            connectionLimit:100,
        },{
            host: '54.169.107.53',
            user: 'root',
            password: 'gtdollar',
            database: 'MeltEx', // 前面建的user表位于这个数据库中
            port: 3306,
            connectionLimit:100,
        }]
    },


    redis: {
        host: `54.169.107.53`,
        port: '6379',
        password: 'gtdollar',
        db: 0,
        prefix: 'c_'
    },

    cacheDB:{
        users:15,
        system:0,
        order:1,
        kline:2,
        otc: 3
    },
    cacheKey:{
        Users:'users_',                                         // 用户信息 data:15 String 用户id做索引,
        User_Login_Pass_Retry:'User_Login_Pass_Retry_',         // 用户登录密码重试 data:15 String
        User_Token:"User_Token_",                               // 用户token data:15 String

        User_Auth_Strategy:'User_Auth_Strategy_',               // 用户安全策略 data:15
        User_Auth_Strategy_Type:'User_Auth_Strategy_Type',      // 用户安全策略类型data:15 hash

        User_Alert:'User_Alert_',                               // 用户通知 data:15 hash
        User_Alert_Type:'User_Alert_Type',                      // 用户通知类型 data:15 hash
        User_Code:'User_Code_',                                 // 用户验证码
        Sys_Base_Coin_Prices:'Sys_Base_Coin_Prices',
        User_Assets:'User_Assets_',                             //用户资产 data:15 hash

        Sys_Lang:'Sys_Lang',                                    // 系统语言 data:0 hash
        Sys_Msg_tpl:"Sys_Msg_tpl",                              // 系统通知模板 data0 hash
        Sys_Config:'Sys_Config',                                //系统配置 data0 hash

        Sys_Coin:'Sys_Coin',                                    // 所有币种 data:0 hash
        Sys_Coin_Exchange:'Sys_Coin_Exchange',                  // 所有币种交易对 data:0 hash

        Sys_OTC_Coin: 'Sys_OTC_Coin',                            // 所有OTC币种 data:0 hash
        User_OTC_Secret_Remark: "User_OTC_Secret_Remark",
        User_Assets_OTC: "User_Assets_OTC_",                     // 用户OTC资产信息 data:15 hash
        Buy_Entrust_OTC: "Buy_Entrust_OTC_",                     //买单委托OTC
        Sell_Entrust_OTC: "Sell_Entrust_OTC_",                   //卖单委托OTC
        Entrust_OTC_UserId: "Entrust_OTC_UserId_",               //用户委托OTC
        Order_OTC_UserId: "Order_OTC_UserId_"                   //用户订单OTC

    },

    MQ:{
        protocol: 'amqp',
        hostname: '54.169.107.53',
        port: 5672,
        username: 'gtuser',
        password: 'gtdollar',
        vhost: '/',
        connectionLimit:5,
    },
    MQKey:{
        Send_Code:'Send_Code',
        Send_Alert:'Send_Alert',
        Entrust_Queue:'Entrust_CEId_',
        Entrust_OTC_Queue:'Entrust_OTC_CoinId_'
    },
};

module.exports = config;