import { latencyMeasurer } from "./latencyMeasurer.js";

class MyProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.samplerate = options.processorOptions.samplerate;
        this.latencyMeasurer = new latencyMeasurer();
        this.latencyMeasurer.toggle();
        this.lastState = 0;
        this.port.postMessage('___ready___');
    }

    process(inputs, outputs, parameters) {
        if(!inputs[0].length) return
        let inBufferL = null, inBufferR = null, outBufferL = null, outBufferR = null;
        if (typeof inputs.getChannelData === 'function') {
            inBufferL = inputs.getChannelData(0);
            inBufferR = inputs.getChannelData(1);
        } else {
            inBufferL = inputs[0][0];
            inBufferR = inputs[0][1];
        }
        if (typeof outputs.getChannelData === 'function') {
            outBufferL = outputs.getChannelData(0);
            outBufferR = outputs.getChannelData(1);
        } else {
            outBufferL = outputs[0][0];
            outBufferR = outputs[0][1];
        }

        this.latencyMeasurer.processInput(inBufferL, inBufferR, this.samplerate, 128);
        this.latencyMeasurer.processOutput(outBufferL, outBufferR);

        if (this.lastState != this.latencyMeasurer.state) {
            this.lastState = this.latencyMeasurer.state;
            this.port.postMessage({ state: this.lastState, latency: this.latencyMeasurer.latencyMs });
        }
        return true;
    }
}

if (typeof AudioWorkletProcessor === 'function') registerProcessor('MyProcessor', MyProcessor);
export default MyProcessor;
