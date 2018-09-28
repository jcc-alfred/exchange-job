let crypto = require('crypto');
let config = require('../config');

let CryptoUtils = {
    aesEncode(data){
        let cipher = crypto.createCipher('aes192', config.sys.cyptoKey);
        let crypted = cipher.update(data, 'utf8', 'hex');
        crypted += cipher.final('hex');
        return crypted;
    },

    aesDecode(encrypted){
        if(encrypted){
            let decipher = crypto.createDecipher('aes192', config.sys.cyptoKey);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }else{
            return '';
        }
    }
}

module.exports = CryptoUtils;