**Note: this main branch represents the upcoming FRAIDYCAT 2 - which is not 
quite there - to access the stable branch (the web extension), please see
the [v1.1 branch](https://github.com/kickscondor/fraidycat/tree/v1.1).**

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
            | ||   | ||        '-'      ~ twitter, reddit, insta, yt, etc ~
            | ||   | ||
            '-''   '-''                            :. :.

**Fraidycat** is an app for Linux, Windows or Mac OS X - but which can be
accessed from a local browser or a Tor onion site - and is a tool
that can be used to follow folks on a variety of platforms. But rather
than showing you a traditional 'inbox' or 'feed' view of all the incoming
posts - Fraidycat braces itself against this unbridled firehose! - you are
shown an overview of who is active and a brief summary of their activity.

**[Release links coming soon.]**

Here is my Fraidycat home page from October 25th, 2019:

![My Fraidycat home page](https://fraidyc.at/images/fraidycat-oct2019.png)

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

## Features

Follows are arranged by tag - each can have multiple tags - the tabbed bar
along the top of the main page lets you select the tag to view. You then narrow
down by importance - tags can be checked in 'real-time' or 'daily', 'weekly',
'monthly' and 'yearly'.

Follows are shown in dark green if they have been updated in the past two days,
a plain cyan if they are up to a month old and in an unassuming light brown if they
are over a month old. A small graph of activity over the past year is displayed - in
pink (if showing the previous two months of activity) or in gray (if
showing the past six months.)

Fraidycat is quite light on features - I am mostly focused on making sure that
it supports a lot of different sites and that it safely syncs between your
different computers.

### Follow Support

Here is a current list of what is fully supported:

* **Feeds (RSS, Atom, JSON Feed).** It will discover any feeds attached to the
  URL you supply. Many sites not listed (like Mastodon, micro.blog,
  Wikipedia, Kickstarter or Stack Overflow) will automatically work because
  of this. (*ALL SITES SHOULD SUPPORT THIS COME ON FRIENDS! IT'S TOO EASY!*)
* **TiddlyWiki.** As odd as this seems, I use this heavily to follow wikis
  like philosopher.life and wiki.waifu.haus. The entire wiki is read every time
  it changes - so be aware that this can cause some strain on the extension.
* **Pinboard, YouTube and Reddit.** These sites offer RSS feeds, but they are
  not discoverable (in the meta tags), so there is some logic to figure out
  these feeds for you.
* **Tiktok.** Believe it!
* **Facebook.** Public pages only.
* **Twitch.** Including whether a streamer is 'live'!
* **Twitter.** On older versions of Firefox, the Strict Tracking Protection
  may block this.
* **Instagram.** Public accounts only, currently.
* **SoundCloud and Bandcamp.** Spotify and Apple Music are not presently
  supported.
* **Kickstarter, Patreon, Pinterest, Tumblr, Steam, Are.na** and more!

Feel free to file an issue for any site you want added - I will try to help
you!

### Importance

Fraidycat lets you assign an 'importance' to your feeds. They are:

* **Real-time.** ("Keep me as up-to-date as you can.") Currently, this checks
  the follow every 5-10 minutes.
* **Daily.** ("I usually just check in as part of a morning routine.") Fraidycat
  will actually check this every 1-2 hours.
* **Weekly** and **Monthly.** ("My visits here are only occassional" or "This follow doesn't
  update much.") Checks are done at least once a day.
* **Yearly.** ("I don't keep up with this, but I don't want to lose it either.")
  Also checked at least once a day. So, when you get around to checking these,
  they should be up-to-date.

Fraidycat attempts to send ETags and Last-Modified headers so that feeds aren't
actually refetched if they haven't changed.

## Installation

### Building the Firefox / Chrome Web Extension

If you're checking out the code from Github, make sure you've installed
[git-lfs](https://git-lfs.github.com) first. Then, clone normally.

Then, to build the app, use:

    npm install
    npm run build

To force building a package for a different platform, pass in the platform
name through the `PLATFORM` environment variable.

    PLATFORM=win npm run build

### License

Fraidycat is distributed under the Blue Oak Model License 1.0.0.
Read it [here](LICENSE.md).
