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
};

module.exports = CryptoUtils;


// console.log(CryptoUtils.aesDecode('20774f623169515d75322ca087a2f72ef8343d94920d585f93f8b29a49637f04ae5dca13f930e48d9e1d40b585ba3999dca3928129bb3397ee7c092b422683179006f5e48062f30436889d106f3086c0'))