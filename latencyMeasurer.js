const measurementStates = {
    measure_average_loudness_for_1_sec: 0,
    playing_and_listening: 1,
    waiting: 2,
    passthrough: 3,
    idle: 4,
};

function sumAudio(left, right, numberOfSamples) {
    let sum = 0;
    for (let n = 0; n < numberOfSamples; n++) {
      sum += Math.abs(left[n]) + Math.abs(right[n]);
    }
    return sum;
}

class latencyMeasurer {
    constructor() {
        this.measurementState = this.nextMeasurementState = measurementStates.idle;
        this.samplesElapsed = this.sineWave = this.sum = this.threshold = this.state = this.samplerate = this.latencyMs = this.buffersize = 0;
        this.roundTripLatencyMs = new Array(10).fill(0.0);
    }

    toggle() {
        if ((this.state == -1) || ((this.state > 0) && (this.state < 11))) { // stop
            this.state = 0;
            this.nextMeasurementState = measurementStates.idle;
        } else { // start
            this.state = 1;
            this.samplerate = this.latencyMs = this.buffersize = 0;
            this.nextMeasurementState = measurementStates.measure_average_loudness_for_1_sec;
        }
    }

    togglePassThrough() {
      if (this.state != -1) {
          this.state = -1;
          this.nextMeasurementState = measurementStates.passthrough;
      } else {
          this.state = 0;
          this.nextMeasurementState = measurementStates.idle;
      }
    }

    processInput(left, right, _samplerate, numberOfSamples) {
        // Possible fix for Firefox
        /*if (!left || !right) {
            console.error("Undefined buffers received:", { left, right });
            return;
        }*/
        this.rampdec = -1.0;
        this.samplerate = _samplerate;
        this.buffersize = numberOfSamples;

        if (this.nextMeasurementState != this.measurementState) {
            if (this.nextMeasurementState == measurementStates.measure_average_loudness_for_1_sec) this.samplesElapsed = 0;
            this.measurementState = this.nextMeasurementState;
        }

        switch (this.measurementState) {
            // Measuring average loudness for 1 second.
            case measurementStates.measure_average_loudness_for_1_sec:
                this.sum += sumAudio(left, right, numberOfSamples);
                this.samplesElapsed += numberOfSamples;

                if (this.samplesElapsed >= this.samplerate) { // 1 second elapsed, set up the next step.
                    // Look for the audio energy rise of 24 decibel.
                    let averageAudioValue = ((this.sum) / (this.samplesElapsed >> 1));
                    let referenceDecibel = 20.0 * Math.log10(averageAudioValue) + 24.0;
                    this.threshold = Math.pow(10.0, referenceDecibel / 20.0);

                    this.measurementState = this.nextMeasurementState = measurementStates.playing_and_listening;
                    this.sineWave = 0;
                    this.samplesElapsed = 0;
                    this.sum = 0;
                }
                break;

            // Playing sine wave and listening if it comes back.
            case measurementStates.playing_and_listening:
                let averageInputValue = sumAudio(left, right, numberOfSamples) / numberOfSamples;
                this.rampdec = 0.0;

                if (averageInputValue > this.threshold) { // The signal is above the threshold, so our sine wave comes back on the input.
                    let n = 0, i = 0;
                    while (n < numberOfSamples) { // Check the location when it became loud enough.
                        if (left[i] > this.threshold) break;
                        if (right[i++] > this.threshold) break;
                        n++;
                    }
                    this.samplesElapsed += n; // Now we know the total round trip latency.

                    if (this.samplesElapsed > numberOfSamples) { // Expect at least 1 buffer of round-trip latency.
                        this.roundTripLatencyMs[this.state - 1] = (this.samplesElapsed * 1000) / this.samplerate;

                        let sum = 0, max = 0, min = 100000.0;
                        for (n = 0; n < this.state; n++) {
                            if (this.roundTripLatencyMs[n] > max) max = this.roundTripLatencyMs[n];
                            if (this.roundTripLatencyMs[n] < min) min = this.roundTripLatencyMs[n];
                            this.sum += this.roundTripLatencyMs[n];
                        }

                        if (max / min > 2.0) { // Dispersion error.
                            this.latencyMs = 0;
                            this.state = 10;
                            this.measurementState = this.nextMeasurementState = measurementStates.idle;
                        } else if (this.state == 10) { // Final result.
                            this.latencyMs = parseInt(this.sum * 0.1);
                            this.measurementState = this.nextMeasurementState = measurementStates.idle;
                        } else { // Next step.
                            this.latencyMs = parseInt(this.roundTripLatencyMs[this.state - 1]);
                            this.measurementState = this.nextMeasurementState = measurementStates.waiting;
                        }

                        this.state++;
                    } else this.measurementState = this.nextMeasurementState = measurementStates.waiting; // Happens when an early noise comes in.

                    this.rampdec = 1.0 / numberOfSamples;
                } else { // Still listening.
                    this.samplesElapsed += numberOfSamples;

                    // Do not listen to more than a second, let's start over. Maybe the environment's noise is too high.
                    if (this.samplesElapsed > this.samplerate) {
                        this.rampdec = 1.0 / numberOfSamples;
                        this.measurementState = this.nextMeasurementState = measurementStates.waiting;
                        this.latencyMs = -1;
                    }
                }
                break;

            case measurementStates.passthrough:
            case measurementStates.idle: break;

            default: // Waiting 1 second.
                this.samplesElapsed += numberOfSamples;
                this.sum = 0;
                if (this.samplesElapsed > this.samplerate) { //  1 second elapsed, start over.
                    this.samplesElapsed = 0;
                    this.measurementState = this.nextMeasurementState = measurementStates.measure_average_loudness_for_1_sec;
                }
        }
    }


    processOutput(left, right) {
        if (this.measurementState == measurementStates.passthrough) return;

        if (this.rampdec < 0.0) { // Output silence.
            let n = this.buffersize * 2, i = 0;
            while (n--) left[i] = right[i++] = 0;
        } else {
            let ramp = 1.0, mul = (2.0 * Math.PI * 1000.0) /  this.samplerate; // 1000 Hz
            let n = this.buffersize, i = 0;
            while (n--) {
                left[i] = right[i++] = Math.sin(mul * this.sineWave) * ramp;
                ramp -= this.rampdec;
                this.sineWave += 1.0;
            }
        }
    }
}


export { latencyMeasurer };
