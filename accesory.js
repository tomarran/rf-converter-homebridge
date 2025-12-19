const dgram = require('dgram');

const UDP_PORT = 26258;

class RFAccessory {
  constructor(log, accessory, api, ip, keyCode) {
    this.log = log;
    this.accessory = accessory;
    this.api = api;
    this.ip = ip;
    this.keyCode = keyCode;

    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    // Get the Switch service if it exists, otherwise create it
    this.service = this.accessory.getService(this.Service.Switch) || 
                   this.accessory.addService(this.Service.Switch, this.accessory.displayName);

    // Register the "On" characteristic
    this.service.getCharacteristic(this.Characteristic.On)
      .onSet(this.handleOnSet.bind(this))
      .onGet(() => false); // Always show as "Off" by default in the UI
  }

  /**
   * Called when you tap the switch in the Home app
   */
  async handleOnSet(value) {
    // We only care about the "Turn On" action
    if (!value) return;

    this.log.info(`Triggering Remote: ${this.accessory.displayName} [Code: ${this.keyCode}]`);

    try {
      await this.sendRFCommand();
      
      // Success - now reset the switch to "Off" in HomeKit after a short delay
      // to simulate a physical button press.
      setTimeout(() => {
        this.service.updateCharacteristic(this.Characteristic.On, false);
      }, 500);

    } catch (error) {
      this.log.error(`Failed to send RF command to ${this.ip}:`, error);
    }
  }

  /**
   * Constructs and sends the UDP packet to the RF Converter
   */
  sendRFCommand() {
    return new Promise((resolve, reject) => {
      const client = dgram.createSocket('udp4');
      
      // The Safemate V3.0 Command Protocol:
      // [Header (4 bytes)] + [Key Code (4 bytes)] + [Optional Checksum/Padding]
      const header = Buffer.from([0x03, 0x01, 0x00, 0x00]); 
      const codeBuffer = Buffer.from(this.keyCode, 'hex');
      
      // Combine the header and the specific key code
      const packet = Buffer.concat([header, codeBuffer]);

      client.send(packet, UDP_PORT, this.ip, (err) => {
        client.close();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

module.exports = { RFAccessory };