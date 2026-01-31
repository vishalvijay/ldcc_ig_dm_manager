# LDCC Instagram DM Agent - Project Documentation

## Overview

Build an Instagram DM agent for **London Desperados Cricket Club (LDCC)** to handle incoming messages as a social media manager.

---

## Club Information

### Basic Details
- **Club Name**: London Desperados Cricket Club (LDCC)
- **Location**: London, UK
- **Home Ground**: Regent's Park
- **Instagram**: https://www.instagram.com/londondesperados/ (@londondesperados)

### Leagues & Teams
- **Middlesex Saturday League**: Team 1 (Division 5), Team 2 (Division 5)
- **Essex Sunday League**
- 3 teams combined across Saturday and Sunday

### Achievements
- Middlesex League Champions 2023
- Middlesex League Champions 2024
- Essex League Champions 2024

---

## Recruitment Context

LDCC is currently running an **ad campaign** to invite new players. Key points:
- Looking to expand the teams
- IG post used for ad campaign: https://www.instagram.com/p/DHQ1TG6I-7g/
- Open to players of **ANY experience level** (adults only)
- Value **passion over skill**
- Most ad respondents start with: "can I get more info on this?"

---

## Indoor Net Sessions

### Details
- **Location**: Leyton Sports Ground, 2 Crawley Rd, London E10 6RJ
- **Google Maps**: https://maps.app.goo.gl/sVTG8nBwA23BoLxL8
- **Schedule**: Weekends (fetch from Spond MCP)
- **First session**: FREE
- **Subsequent sessions**: £5 nominal fee

### Kit Requirements
- Bring your own cricket kit (preferred)
- Club kit available if needed
- **Must bring your own abdo guard**

### Session Data Source
Fetch up-to-date event details from Spond via MCP server:
- URL: `https://us-central1-spond-mcp-server.cloudfunctions.net/mcp/mcp`

---

## Contact Information

**Social Media Manager**: Vishal
- Phone: +447977594479
- Email: 0vishalvijay0@gmail.com
- WhatsApp (for notifications): +919995533909

**Net session coordinator**: Adarsh
- Phone: +447867247359
- Any net session related query, feel free to contact this person.

---

## Agent Behavior Requirements

Agent is acting as Vishal (who is the social media manager).

### Primary Goal
Respond to people messaging LDCC on Instagram about joining the club.

### Message Handling
1. **Debouncing**: Users may send multiple messages quickly - wait with randomized delay (5-15s) for more messages before responding, combine if same topic
2. **New Threads Only**: Only respond to new message threads, not existing conversations (check with Instagram API)
3. **Context Awareness**: Ensure full conversation context before responding

### Intent Classification
- **Joining Inquiry**: Respond with club info and guide to booking a trial session
- **Other Intent**: DO NOT respond. Instead, notify Vishal via WhatsApp for human follow-up. Don't send duplicate notification for the same user at least for a week.

### Conversation Flow

#### First Message Response (Ad Campaign)
When user sends "can I get more info on this?" (or similar), respond with:

```
Hello! 👋

We are a cricket club based in London. We play in Middlesex (Team 1 Div 5, Team 2 Div 5) and Essex cricket leagues. We currently have 3 teams combined both Saturday and Sunday. We have been the champions of these leagues in 2023, 2024. 🏆

We are currently looking to expand our teams, and it's open to any experience level.

If you are interested or want to explore the team, we run weekend net sessions where you can meet the squad and have a hit.

Let me know if you have any questions!
```

#### Progressive Information Reveal
**DO NOT reveal all details upfront!**

| Information | When to Share |
|-------------|---------------|
| Club intro & leagues | First message |
| Net session dates | When user asks/shows interest/first propose immediately available date |
| Location (Leyton) | When user confirms a date and time / ask to be there 15 mins earlier |
| Cost ("first session free") | When user confirms OR asks about cost |
| Kit requirements | When confirming booking |
| Google Maps link | When confirming booking |

#### Booking Flow
1. User shows interest → Share available session dates (from Spond)
2. User picks a date → Mention location and "first session is free"
3. Ask for name and phone number
4. Confirm booking with full details (address, map link, abdo guard reminder)
5. Share Net session coordinator info.
6. Send confirmation notification to Vishal via WhatsApp

(No need to store current coversation stage, it can be determined from message history)

### Positive Message Handling
- Like/react to positive messages from users (thanks, excited, etc.) (Use Instagram reaction API)

### Tone & Style
- Friendly and semi-professional
- Keep messages concise (Instagram style)
- Only use information provided - don't make up details
- Let the user lead the conversation
- Don't push session dates immediately - answer their questions first