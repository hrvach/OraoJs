Orao Emulator
============

[Orao](https://en.wikipedia.org/wiki/Orao_%28computer%29) is a Croatian 8-bit
computer used primarily in elementary schools, as part of a computer literacy
initiative.

This is an attempt of an emulator written in Javascript, licensed under the
terms of the GNU General Public License, version 2 or later (GPLv2+). 

It's a port of my [Python-based emulator](https://github.com/hrvach/OraoPy),
with some features missing for now (save). 

Instructions
-------------

Enter BASIC using "BC". When asked about the memory size, press ENTER unless
you don't want BASIC to use the entire available memory. 

To return to monitor from BASIC, press ESC.

WAV files containing programs / games are located in the wav folder.

Try LMEM "DEMO2" and be patient, it loads at the original speed. Additional
documentation can be found at the Python-based emulator repository, where the
original PDF manual can be downloaded.

It *should* work in newer browsers, tested in Iceweasel (FF) and Chromium.

Check out a [Live DEMO](http://blog.hrvoje.org/blog/2015/12/03/the-eagle-has-landed/)
with several available programs and have fun!
