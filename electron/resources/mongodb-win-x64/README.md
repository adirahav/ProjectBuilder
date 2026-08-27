# mongod.exe goes here

Put a single file in this folder:

```
electron/resources/mongodb-win-x64/mongod.exe
```

Get it from the official MongoDB Community Server download (server-only ZIP,
Windows x86_64): https://www.mongodb.com/try/download/community — pick
"Package: ZIP", extract it, and copy just `bin/mongod.exe` here. No install,
no `mongos.exe` (that's for sharded clusters — not needed for a single local
instance; see chat history), no `mongosh.exe` (not needed at runtime, only
for a human to poke at the DB by hand if they want to install it separately).

Not committed to git — `.gitignore` excludes every `.exe` in this folder.
It's a large (~100MB+), license-bearing binary that doesn't belong in
version control; `electron-builder`'s `extraResources` config (see
`electron/package.json`) picks it up straight from disk at packaging time,
not from git history.
