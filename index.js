const RFPlatform = require('./platform');

module.exports = (api) => {
  api.registerPlatform('homebridge-yet6956-rf', 'YET6956RFPlatform', RFPlatform);
};