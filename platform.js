const dgram = require('dgram');
const { RFAccessory } = require('./accessory');

const PLUGIN_NAME = 'homebridge-rf-converter';
const PLATFORM_NAME = 'RFConverterPlatform';
const UDP_PORT = 26258;

class RFPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = [];

    // The Python script uses this header for Discovery
    this.discoveryHeader = Buffer.from([0x01, 0x01, 0x12, 0x00, 0x00, 0x00]);

    this.api.on('didFinishLaunching', () => {
      this.log.info('Platform finished launching. Starting auto-discovery...');
      this.discoverDevices();
    });
  }

  // Homebridge calls this for cached accessories
  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }

  discoverDevices() {
    const socket = dgram.createSocket('udp4');

    socket.on('message', (msg, rinfo) => {
      this.log.debug(`Received response from ${rinfo.address}: ${msg.toString('hex')}`);
      
      // The Python script parses the response to extract the list of remotes.
      // Typically, Safemate devices return a packet where names start at offset 12.
      this.parseDeviceResponse(msg, rinfo.address);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      this.log.info('Broadcasting discovery packet...');
      socket.send(this.discoveryHeader, UDP_PORT, '255.255.255.255');
    });

    // Stop listening after 10 seconds to save resources
    setTimeout(() => {
      socket.close();
      this.log.info('Discovery window closed.');
    }, 10000);
  }

  parseDeviceResponse(buffer, ip) {
    // This replicates the Python logic for decoding the remote list.
    // Safemate V3.0 packets usually have a header [0x02, 0x01, ...]
    // followed by segments of 32 bytes per remote.
    
    try {
      // Basic check if it's a valid data packet from the converter
      if (buffer[0] !== 0x02) return; 

      const remoteCount = buffer[7]; // Typical offset for remote count
      this.log.info(`Found ${remoteCount} remotes on device at ${ip}`);

      for (let i = 0; i < remoteCount; i++) {
        // Each remote entry is typically 64 bytes in the Safemate protocol
        const offset = 12 + (i * 64);
        const remoteName = buffer.toString('utf-8', offset, offset + 16).replace(/\0/g, '').trim();
        const keyCode = buffer.slice(offset + 16, offset + 20).toString('hex');

        if (remoteName) {
          this.log.info(`Mapping Remote: "${remoteName}" with Key Code: ${keyCode}`);
          this.addAccessory(remoteName, keyCode, ip);
        }
      }
    } catch (e) {
      this.log.error('Error parsing device response. Protocol may have changed:', e);
    }
  }

  addAccessory(name, keyCode, ip) {
    const uuid = this.api.hap.uuid.generate(name + keyCode);
    const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);

    if (existingAccessory) {
      this.log.info(`Restoring existing remote from cache: ${name}`);
      new RFAccessory(this.log, existingAccessory, this.api, ip, keyCode);
    } else {
      this.log.info(`Adding new remote: ${name}`);
      const accessory = new this.api.platformAccessory(name, uuid);
      
      // Store data for the accessory
      accessory.context.ip = ip;
      accessory.context.keyCode = keyCode;

      new RFAccessory(this.log, accessory, this.api, ip, keyCode);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}

module.exports = RFPlatform;