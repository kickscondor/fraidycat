     
                             /||
                             \ \\
            ,_       _,     _/ //
            |\\_____/||----- ____\
            |        |_------     |  :. :.
            |  {}{}  |            |
            |  =v=   |        ___ |  fraidycat
            |   ^    | _------ | ||
            | ,----, ||    ||| | ||  follow from afar
            | ||   | ||    ||| | ||
            | ||   | ||    ||' | ||  ~ blogs, wikis ~
            | ||   | ||        '-'      ~ twitter, insta, yt, etc ~
            | ||   | ||
            '-''   '-''                            :. :.

**Fraidycat** is a browser extension for Firefox or Chrome - or a Dat website
that can be used in the Beaker Browser - that can be used to follow folks on
a variety of platforms. But rather than showing you a traditional 'inbox' or 'feed'
view of all the incoming posts - Fraidycat braces itself against this unbridled
firehose! - you are shown an overview of who is active and a brief summary of
their activity.

Here is my Fraidycat home page from October 25th, 2019:

![My Fraidycat home page](https://www.kickscondor.com/images/blog/fraidycat-oct26.png)

Fraidycat attempts to dissolve the barriers between networks - each with their
own seeming 'network effects' - and forms a personal network for you, a personal
surveillance network, if you will, of the people you want to monitor. (It's as if
the Web itself is now your network - imagine that.)

There are no fancy algorithms behind Fraidycat - everything is organized by
recency. (Although, you can sort follows into tags and priority - "do I want to
track this person in real-time? Is this a band that I am only interested in checking
in on once a year?") For once, the point isn't for the tool to discern your
intent from your behavior; the point is for you to *wield* the tool, as if you
are a rather capable kind of human being.

## Installation

Presently I really only encourage use of Fraidycat as a web extension for
Firefox and Chrome. (I also use it with Vivaldi - works great.) Beaker still
needs to release some fixes I have submitted for me to feel okay about promoting
it on that network.

### Firefox / Chrome Web Extension

To build the web extension, use:

    npm install
    npm run webext

The extension will appear in a `dist-webext` folder. You can then load that
"unpacked" extension from the browser - as a 'temporary add-on', for example,
in Firefox.

(Be aware that syncing may not work when using the extension in this way - it
does in Chrome, though.)

### License

Fraidycat is distributed under the Blue Oak Model License 1.0.0.
Read it [here](LICENSE.md).
