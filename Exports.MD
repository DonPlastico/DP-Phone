DP-Phone exports

# Crypto (Server side)

```

exports['DP-Phone']:RemoveCrypto(src, type, amount)

exports['DP-Phone']:hasEnough(src, type, amount)

exports['DP-Phone']:AddCrypto(src, type, amount)

```

# Groups (Server Side)

```

exports['DP-Phone']:NotifyGroup(group, msg, type)

exports['DP-Phone']:pNotifyGroup(group, header, msg, icon, colour, length)

exports['DP-Phone']:CreateBlipForGroup(groupID, name, data)

exports['DP-Phone']:RemoveBlipForGroup(groupID, name)

exports['DP-Phone']:GetGroupByMembers(src)

exports['DP-Phone']:getGroupMembers(groupID)

exports['DP-Phone']:getGroupSize(groupID)

exports['DP-Phone']:GetGroupLeader(groupID)

exports['DP-Phone']:DestroyGroup(groupID)

exports['DP-Phone']:isGroupLeader(src, groupID)

--------------------------------------------------

exports['DP-Phone']:setJobStatus(groupID, status, stages)

exports['DP-Phone']:getJobStatus(groupID)

exports['DP-Phone']:resetJobStatus(groupID)

--------------------------------------------------

exports['DP-Phone']:isGroupTemp(groupID)

exports['DP-Phone']:CreateGroup(src, name, password)

```

# Notifications (Client side)

```

exports['DP-Phone']:PhoneNotification(title, text, icon, color, timeout, accept, deny)

```

# Twitter (Server side)

```

local function escape_str(s)
	return s
end

local TweetData = {
    firstName = PhoneData.PlayerData.charinfo.firstname,
    lastName = PhoneData.PlayerData.charinfo.lastname,
    citizenid = PhoneData.PlayerData.citizenid,
    message = escape_str(data.Message):gsub("[%<>\"()\'$]",""),
    time = data.Date,
    tweetId = "TWEET-"..math.random(11111111, 99999999),
    type = data.type,
    url = URL
}

exports['DP-Phone']:AddNewTweet(TweetData)

```
