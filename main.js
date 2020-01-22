import { latencyMeasurer } from "./latencyMeasurer.js";

class app {
    static initialize(e) {
        app.currentSection = app.currentAnchor = app.audioContext = app.audioNode = null;

        let navItems = document.getElementById('nav').getElementsByTagName('a');
        for (let a of navItems) a.addEventListener('click', function(e) {
            e.preventDefault();
            app.navClick(e.target);
        });
        app.navClick(navItems[0]);

        app.content = document.getElementById('content');
        app.content.innerHTML = '<h2>Initializing...</h2>';
        let audioWorklet = (typeof AudioWorkletNode === 'function') ? 1 : 0;
        app.data = {
            device: '?',
            os: '?',
            browser: '?',
            browserVersion: '?',
            buffersize: audioWorklet ? 128 : 512,
            samplerate: '?',
            audioWorklet: audioWorklet
        };
        app.runningon = '?';

        let xhr = new XMLHttpRequest();
        xhr.timeout = 10000;
        xhr.onload = function() {
            if (xhr.status == 200) {
                app.getDeviceData(xhr.responseText);
                app.displayStart();
            }
        }
        xhr.onerror = function() {
            app.displayStart();
        }
        xhr.open('POST', 'https://api.whatismybrowser.com/api/v2/user_agent_parse', true);
        xhr.setRequestHeader('X-API-KEY', '537c5c214028e36667cb0b8f8f2cb2c8');
        xhr.send(JSON.stringify({ 'user_agent': navigator.userAgent }));
    }

    static navClick(a) {
        let href = a.href;
        let target = href.substring(href.indexOf('#') + 1);
        if (app.currentSection != null) app.currentSection.style.display = 'none';
        if (app.currentAnchor != null) app.currentAnchor.className = '';
        app.currentSection = document.getElementById(target);
        app.currentAnchor = a;
        app.currentSection.style.display = 'block';
        app.currentAnchor.className = 'selected';
    }

    static send(latencyMs) {
        let xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://superpowered.com/latencydata/web.php', true);
        xhr.setRequestHeader('Content-type', 'application/json');
        xhr.send(JSON.stringify(app.data));
    }

    static getDeviceData(json) {
        json = JSON.parse(json);
        if (json == null) return;

        if (json.parse.hardware_type == 'mobile') {
            app.data.device = json.parse.operating_platform_vendor_name;
            if (json.parse.hardware_sub_type) app.data.device += ' ' + json.parse.hardware_sub_type;
            if (json.parse.operating_platform_code) app.data.device += ' ' + json.parse.operating_platform_code;
        } else app.data.device = json.parse.hardware_type;

        app.data.os = json.parse.operating_system_name + ' ' + json.parse.operating_system_version_full.toString().replace(/,/g,'.');
        app.data.browser = json.parse.software_name;
        app.data.browserVersion = json.parse.software_version;

        app.runningon = app.data.device + ', ' + app.data.os + ', ' + app.data.browser + ' ' + app.data.browserVersion + ', ' + (app.data.audioWorklet ? 'Audio Worklet' : 'ScriptProcessor');
    }

    static displayStart() {
        if (app.audioContext != null) app.audioContext.close();
        app.audioContext = app.audioNode = null;
        document.getElementById('prepare').style.display = 'block';
        document.getElementById('thisdevice').innerText = 'Currently running on: ' + app.runningon;
        app.content.innerHTML = '';
        app.startbutton = document.createElement('button');
        app.startbutton.innerText = 'START';
        app.startbutton.addEventListener('click', app.start);
        app.content.appendChild(app.startbutton);
    }

    static onAudioInputPermissionDenied(error) {
        app.displayResult('<h3>Error: ' + error + '</h3><p>Please check the microphone permission.</p>');
    }

    static onMessageFromAudioScope(message) {
        if (message.latencyMs < 0) {
            app.displayResult('<h3>The environment is too loud!</h3><p>Please try it again in a quieter environment.</p>');
        } else if (message.state == 11) {
            if (message.latency < 1) app.displayResult('<h3>The variance is too big.</h3><p>Please try it again in a quieter environment.</p>');
            else {
                app.data.ms = message.latency;
                app.send();
                app.displayResult('<h3>Result: ' + message.latency + 'ms</h3><p>10 ms or lower allows for the best real-time interactive experience. Below 50 ms provides acceptable results for simple audio use-cases and maximum 100 ms is acceptable for gaming.</p>');
            }
        } else {
            let percentage = ((parseInt(message.state) - 1) / 10) * 100;
            if (percentage < 1) percentage = 1; else if (percentage > 100) percentage = 100;
            document.getElementById('progressBar').style.width = percentage + '%';
        }
    }

    static onAudioSetupFinished() {
        let audioInput = app.audioContext.createMediaStreamSource(app.inputStream);
        audioInput.connect(app.audioNode);
        app.audioNode.connect(app.audioContext.destination);
        app.content.innerHTML = '<h3>Please wait...</h3><p id="progressBody"><span id="progressBar"></span></p>';
        let restartLink = document.createElement('a');
        restartLink.innerText = 'CANCEL';
        restartLink.addEventListener('click', app.displayStart);
        app.content.appendChild(restartLink);
    }

    static displayResult(html) {
        if (app.audioContext != null) app.audioContext.close();
        app.audioContext = app.audioNode = null;
        let div = document.createElement('div');
        div.id = 'result';
        div.innerHTML = html;
        let restartLink = document.createElement('a');
        restartLink.innerText = 'TRY AGAIN';
        restartLink.addEventListener('click', app.displayStart);
        div.appendChild(restartLink);
        app.content.innerHTML = '';
        app.content.appendChild(div);
    }

    static onAudioPermissionGranted(inputStream) {
        app.inputStream = inputStream;
        let audioTracks = inputStream.getAudioTracks();
        for (let audioTrack of audioTracks) audioTrack.applyConstraints({ autoGainControl: false, echoCancellation: false, noiseSuppression: false });

        if (!app.data.audioWorklet) {
            app.latencyMeasurer = new latencyMeasurer();
            app.latencyMeasurer.toggle();
            app.lastState = 0;
            app.audioNode = app.audioContext.createScriptProcessor(app.data.buffersize, 2, 2);

            app.audioNode.onaudioprocess = function(e) {
                app.latencyMeasurer.processInput(e.inputBuffer.getChannelData(0), e.inputBuffer.getChannelData(1), app.data.samplerate, e.inputBuffer.length);
                app.latencyMeasurer.processOutput(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1));

                if (app.lastState != app.latencyMeasurer.state) {
                    app.lastState = app.latencyMeasurer.state;
                    app.onMessageFromAudioScope({ state: app.lastState, latency: app.latencyMeasurer.latencyMs });
                }
            }

            app.onAudioSetupFinished();
        } else {
            let processorPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/processor.js';

            app.audioContext.audioWorklet.addModule(processorPath).then(() => {
                class CustomAudioNode extends AudioWorkletNode {
                    constructor(audioContext, moduleInstance, name) {
                        super(audioContext, name, {
                            'processorOptions': {
                                'samplerate': app.data.samplerate
                            },
                            'outputChannelCount': [2]
                        });
                    }
                    sendMessageToAudioScope(message) { this.port.postMessage(message); }
                }
                app.audioNode = new CustomAudioNode(app.audioContext, app, 'MyProcessor');
                app.audioNode.port.onmessage = (event) => {
                    if (event.data == '___ready___') app.onAudioSetupFinished(); else app.onMessageFromAudioScope(event.data);
                };
            });
        }
    }

    static start(e) {
        document.getElementById('prepare').style.display = 'none';
        app.content.innerHTML = '<h2>Initializing...</h2>';
        let AudioContext = window.AudioContext || window.webkitAudioContext || false;
        app.audioContext = new AudioContext();
        app.data.samplerate = app.audioContext.sampleRate;
        let constraints = {
            'echoCancellation': false,
            'autoGainControl': false,
            'audio': { mandatory: { googAutoGainControl: false, googAutoGainControl2: false, googEchoCancellation: false, googNoiseSuppression: false } },
            'video': false
        };
        navigator.getUserMediaMethod = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
        if (navigator.getUserMediaMethod) navigator.getUserMediaMethod(constraints, app.onAudioPermissionGranted, app.onAudioInputPermissionDenied);
        else if (navigator.mediaDevices.getUserMedia) navigator.mediaDevices.getUserMedia(constraints).then(app.onAudioPermissionGranted).catch(app.onAudioInputPermissionDenied);
        else app.onAudioInputPermissionDenied("Can't access getUserMedia.");
    }
}

window.addEventListener('load', app.initialize);
