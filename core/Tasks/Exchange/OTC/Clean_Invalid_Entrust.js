let schedule = require('node-schedule');
let OTCEntrustModel = require('../../../Model/OTCEntrustModel');


try {
    // var rule = new schedule.RecurrenceRule();
    // var times = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59];
    // rule.minute = times;
    let isRun = false;
    var job = schedule.scheduleJob('1 * * * * *', async () => {
        console.log(new Date());
        if (isRun) {
            return;
        }
        isRun = true;


        let InvalidOpenOrder = await OTCEntrustModel.getInvalidOpenOrder(limit = 100);
        if (InvalidOpenOrder.length > 0) {
            InvalidOpenOrder.map(async (order) => {
                await OTCEntrustModel.InvalidOpenOrder(order);
            });
        }
        let finishedEntrust = await OTCEntrustModel.getFinishedEntrust();
        await Promise.all(finishedEntrust.map(async (entrust) =>
            await OTCEntrustModel.invalidFinishedEntrust(entrust)
        ));

        isRun = false;
    });
} catch (error) {
    isRun = false;
    console.error(error);
}
