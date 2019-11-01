     
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

## Features

Follows are arranged by tag - each can have multiple tags - the tabbed bar
along the top of the main page lets you select the tag to view. You then narrow
down by importance - tags can be checked in 'real-time' or 'daily', 'weekly',
'monthly' and 'yearly'.

Follows are show in dark green if they have been updated in the past two days,
a plain cyan if they are up to a month old and in an unassuming light brown if they
are over a month old. A small graph of activity over the past year is displayed
- in pink (if showing the previous two months of activity) or in gray (if
showing the past six months.)

Fraidycat is quite light on features - I am mostly focused on making sure that
it supports a lot of different sites and that it safely syncs between your
different computers.

### Follow Support

Here is a current list of what is fully supported:

* **Feeds (RSS, Atom, JSON Feed).** It will discover any feeds attached to the
  URL you supply. Many sites not listed (like Wikipedia, Kickstarter or Stack Overflow) will
  automatically work because of this. (*ALL SITES SHOULD SUPPORT THIS COME ON
  FRIENDS!*)
* **TiddlyWiki.** As odd as this seems, I use this heavily to follow wikis
  like philosopher.life and wiki.waifu.haus. The entire wiki is read every time
  it changes - so be aware that this can cause some strain on the extension.
* **Pinboard, YouTube and Reddit.** These sites offer RSS feeds, but they are
  not discoverable (in the meta tags), so there is some logic to figure out
  these feeds for you.
* **Twitter.** Be aware that, if you follow too many Twitter users, you might
  get flagged as a bot. I am looking into just using your credentials to load
  from a 'list' - but I am unsure if this would be seen as overreaching on my
  part.
* **Instagram.** Public accounts only, currently.
* **SoundCloud.** Would also like to support Bandcamp at some point.

Working on support for:

* **Facebook.** Public pages only.
* **Twitch.** Including whether a streamer is 'live'. (Also need to offer this
  for YouTube channels, of course.)
* **Songkick.** I personally need this. Already seems possible, by way of
  [acousti.co](http://acousti.co/songkick), but I don't like relying on
  secondary services.

Feel free to file an issue for any site you want added - I will try to help
you!

### Sync Support

The only way to sync your follows at the moment is through your browser account.
So, if you are using Firefox, you must be signed in as the same user with the
same browser and Fraidycat installed on both machines.

Be aware that each browser will fetch feeds independently - so they may fall out
of sync as they try to stay updated. However, every time you add or edit or
remove a follow, your other computers will be notified.

### Importance

Fraidycat lets you assign an 'importance' to your feeds. They are:

* **Real-time.** ("Keep me as up-to-date as you can.") Currently, this checks
  the follow every 5-10 minutes.
* **Daily.** ("I usually just check in as part of a morning routine.") Fraidycat
  will actually check this every 1-2 hours.
* **Weekly** and **Monthly.** ("My visits here are only occassional" or "This follow doesn't
  update much.") Checks are done every 1-2 days for both.
* **Yearly.** ("I don't keep up with this, but I don't want to lose it either.")
  Checks are done every one or two weeks.

Fraidycat attempts to send ETags and Last-Modified headers so that feeds aren't
actually refetched if they haven't changed.

## Installation

Presently I really only encourage use of Fraidycat as a web extension for
Firefox and Chrome. (I also use it with Vivaldi - works great.) Beaker still
needs to release some fixes I have submitted - only then I will feel okay
promoting it on that network.

I will begin releasing public builds on November 4th, 2019.

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
