let rp = require('request-promise');

class GTTService {
    constructor(host) {
        this.client = rp.defaults({
            baseUrl: host
        });
    }

    async createAccount(address, secret) {
        let options = {
            method: 'POST',
            uri: '/api/user',
            form: {
                address: address,
                secret: secret
            }
        };
        return this.client(options);
    }
}

module.exports = GTTService;