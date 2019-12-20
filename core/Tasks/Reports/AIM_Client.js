let config = require('../../Base/config');
let fs = require('fs');
let HTMLParser = require('node-html-parser');
let rp = require('request-promise');
const vision = require('@google-cloud/vision');

const client = new vision.ImageAnnotatorClient();


class AIM_Client {
    constructor(){
        this.url = config.aim.url;
        this.user= config.aim.user;
        this.password = config.aim.password;
        this.cookie = ""
    }


    async init(){
        let dest = 'code.gif';
        let url = 'http://aimpro.co/Common/ValidateCode';
        let fff = await rp({
            method: "GET",
            uri: url,
            encoding: null,
            headers: {
                'Content-Type': 'image/gif'
            },
            resolveWithFullResponse: true
        });
        let cookie = fff.headers['set-cookie'][0].split(';').find(i => i.indexOf("SessionId") >= 0);

        fs.writeFileSync(dest, fff.body, {encoding: 'binary'});

        let code = null;
        const [result] = await client.textDetection(__dirname + '/' + dest);
        const detections = result.textAnnotations;
        if (detections.length > 0) {
            code = detections[detections.length - 1].description
        }

        if( code) {
            let res = await rp({
                method: 'POST',
                uri: 'http://aimpro.co/Console/Account/Login',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': 'http://aimpro.co/Console/Account/Login',
                    "cookie": cookie
                },
                formData: {
                    loginName: 'admin',
                    loginPwd: 'uuhello123',
                    Code: code
                },
                simple: false,
                resolveWithFullResponse: true
            });
            this.cookie = res.headers['set-cookie'].map(i => i.split(';')[0]).join(';');
            return true
        }else {
            return false
        }
    }
    async getUSDTDepositbyDay(fromDate,endDate){
        let res11 = await rp({
            method: 'GET',
            uri: "http://aimpro.co/Console/Home/MbrCharge",
            qs: {
                K: 'usdt',
                T1: fromDate,
                T2: endDate
            },
            headers: {
                'Referer': 'http://aimpro.co/Console/Home/Main',
                "cookie": this.cookie
            },
            resolveWithFullResponse: true
        });
        let html11 = HTMLParser.parse(res11.body);

        let usdt_deposit = html11.querySelectorAll('table tfoot tr th').length>4 ?
            html11.querySelectorAll('table tfoot tr th')[4].innerHTML :0;
        return parseFloat(usdt_deposit)
    }
}

module.exports = new AIM_Client();

// let a = new AIM_Client();

// a.init().then(a.getUSDTDepositbyDay('2019-11-21','2019-11-22'));
