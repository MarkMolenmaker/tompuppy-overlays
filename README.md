# Tompuppy Overlays
This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.0.0.

## Widgets
Widgets are hosted on the base URL `https://markmolenmaker.github.io/tompuppy-overlays/#/widgets/...?chatroomId=...`. <br>
All widgets are configurable via Query parameters.

The first parameter is always appended with a `?` character. <br>
All additional parameters are appended with a `&` character.

**Global Required parameters**:
- `chatroomId`: The chatroom ID of the channel you want to embed the widget in.

**Global Optional parameters**:
- `admin`: The username-slug of the admin who can control the widget. This parameter can be appended multiple times to allow multiple admins.
  - Example: `?admin=tompuppy&admin=inazumark`

### Kick Channel Events
Use the following URL to embed the widget:
`https://markmolenmaker.github.io/tompuppy-overlays/#/widgets/kick-channel-events?chatroomId=...`

**Optional parameters**:
- `audioVolume`: The volume of the audio (0-1). Default: 0.5
- `audioTTSVolume`: The volume of the audio (0-1). Default: 1
- `subscriptionEventDurationMS`: The duration of the subscription event in milliseconds. Default: 10000
- `subscriptionGiftedEventDurationMS`: The duration of the subscription gifted event in milliseconds. Default: 10000

## Development
**Setting up the development environment**
1. Clone the repository.
2. Run `pnpm install` to install all dependencies.

**Running the development server**
1. Run `pnpm start` to start the development server.
2. Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.
