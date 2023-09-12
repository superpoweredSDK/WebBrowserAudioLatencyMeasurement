This webapp measures the round-trip audio latency of a web browser.

## Why?

Low round-trip audio latency is a strong indicator of how well any web browser and the underlying device is optimized for professional audio applications. Lower audio latency provides significant benefits to users of all sorts of apps like music production, games, augmented hearing apps, VOIP and other interactive apps.

## How does this Web Browser Audio Latency Test work?

The test emits a beep using device speakers that it listens for on the device's microphone. The time difference between emission and capture of the beep is the lag or audio latency. Lower is better, and 10ms or lower is considered professional audio quality.

## Homepage (with latency data)

https://superpowered.com/webbrowserlatency

## Run it locally

`python3 -m http.server`