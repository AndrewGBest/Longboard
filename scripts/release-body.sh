#!/bin/sh
# The text of a release page: the opening lines of docs/RELEASE-NOTES.md, what
# is new in the newest version only, a link to the rest, and the closing part
# about which file to take. The whole file was too long to read on that page.
awk '
  /^New in / { n++ }
  /^\*\*Which file:\*\*/ { tail = 1; print "What changed in earlier versions: https://github.com/AndrewGBest/Longboard/blob/main/docs/RELEASE-NOTES.md\n" }
  tail || n < 2
' docs/RELEASE-NOTES.md
