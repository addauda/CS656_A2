const fs = require('fs');
const Packet = require('./packet');
const client = require('dgram').createSocket('udp4');
const lodash = require('lodash');
const machina = require('machina');

//retrieve cli params
const _emuAddress = process.argv[2];
const _emuPort = process.argv[3];
const _sndPort = process.argv[4];
const _fileName = process.argv[5];

//throw error if cli null or empty
if (!_emuAddress || !_emuPort || !_sndPort || !_fileName) {
	throw "Missing a required CLI param";
}

const fileToPackets = (fileName) => {

	let buffer = fs.readFileSync(fileName);

	if (buffer.length <= Packet.maxDataLength) {
		return [Packet.createPacket(1, buffer.toString("utf-8", 0))];
	}

	let packets = []
	let numPackets = Math.ceil(buffer.length / Packet.maxDataLength);
	let seqCount = 1;
	let startIndex = 0;

	while (packets.length !== numPackets) {
		let nextChunk = (seqCount * Packet.maxDataLength);
		let endIndex = (nextChunk > buffer.length) ? buffer.length : nextChunk;
		packets.push(Packet.createPacket((seqCount - 1), buffer.toString("utf-8", startIndex, endIndex)));
		startIndex = endIndex++;
		seqCount++;
	}

	return packets;
};

client.on('message', (buffer) => {
	let packet = Packet.parseUDPdata(buffer);

	switch (packet.type) {
		case 0:
			sndViaGBN._ackReceived(packet.seqNum);
		case 1:

		case 2:

		default:
			console.log("yo")
	}
});

const sendPacketToEmu = (buffer,) => {
	client.send(buffer, _emuPort, _emuAddress, (err) => {
		(err) ? client.close()
			: console.log(`Sent buffer ${buffer.byteLength}`);
	});
}

const sndViaGBN = new machina.Fsm( {
	namespace: "a2-gbn",
	_windowSize: 10,
	_packets: null,
	_numPacketsInFlight: 0,
	_lastSeqNum: 0,
	_lastAckRecv: 0,
	_ackTimer: null,
    initialState: "ENQUEUEING",
    states: {
        ENQUEUEING: {
            "ENQUEUE": function() {
				this._packets = fileToPackets(_fileName);
                this.transition("TRANSMITTING_PACKETS");
            }
		},
		
        TRANSMITTING_PACKETS: {
            _onEnter: function() {
				if (this._numPacketsInFlight < this._windowSize) {
					let packetsToSend = this._windowSize - this._numPacketsInFlight;
					let sentPackets = 0;
					while (sentPackets < packetsToSend && this._lastSeqNum < this._packets.length - 1)
					{	
						sendPacketToEmu(this._packets[this._lastSeqNum].getUDPData());
						console.log(this._lastSeqNum);
						this._lastSeqNum++;
						sentPackets++;
						this._ackTimer = setTimeout(function() {
							this.transition("RESET");
						}.bind(this), 3000);
					}
				} else {
					this.transition("WAITING");
				}
			},
		},
		
		RESET: {
            _onEnter: function() {
				clearTimeout(this._ackTimer);
				this._lastSeqNum = this._lastAckRecv;
				this._numPacketsInFlight = 0;
				this.transition('TRANSMITTING_PACKETS');
			},
		},

		ACK_RECEIVED: {
			_onEnter: function() {
				
			},
		}
    },

    _initFSM: function() {
        this.handle("ENQUEUE");
	},
	
	_ackReceived: function(ackSeqNum) {
		this.transition("ACK_RECEIVED", ackSeqNum);
    }
} );

sndViaGBN.initFSM();
