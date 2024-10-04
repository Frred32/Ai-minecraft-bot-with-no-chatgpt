// Import necessary packages
const fs = require('fs');
const mineflayer = require('mineflayer');
const { pathfinder, goals } = require('mineflayer-pathfinder');
const getGPT4js = require('gpt4js');

// Create the bot
const bot = mineflayer.createBot({
  host: 'localhost', // Replace with your server address
  port: 54904,      // Replace with your server port
  username: 'Bot',   // Replace with your bot's username
});

// Enable pathfinder
bot.loadPlugin(pathfinder);

// Initialize GPT-4
const options = {
  provider: 'Nextway',
  model: 'gpt-4o-free',
};

// Load memories from JSON file
let memories = [];
if (fs.existsSync('memories.json')) {
  memories = JSON.parse(fs.readFileSync('memories.json', 'utf8'));
}

(async () => {
  const GPT4js = await getGPT4js();
  const provider = GPT4js.createProvider(options.provider);

  let followingPlayer = null; // Track the player being followed

  // Bot event listener for chat messages
  bot.on('chat', async (username, message) => {
    if (username === bot.username) return; // Ignore bot's own messages

    // Make the bot look at the player
    const player = bot.players[username]?.entity;
    if (player) {
      bot.lookAt(player.position.offset(0, player.height, 0)); // Look at the player
    }

    // Prepare context including memories and username
    const memoryContext = memories.map(m => `${m.user}: ${m.message} -> Bot: ${m.response}`).join('\n');
    const messages = [
      { role: 'system', content: "You're a Mineflayer Bot. Your only mission is to follow orders or interact. If someone says 'follow me', ask for their username. Use the format [follow @username] to follow them. If you're following someone and the player wants you to stop following, you will say [stop following]. Example: Ace: Stop following me. You: Sure, I will stop following you [stop following], Ace: Stay here. You: Sure [stop following]. You have raycasting. Example: Ace: There's a village. You: Oh yeah there is. Example 2: Ace: Can you go to this block birch block, that I'm looking at right now. You: Sure [go to block]." },
      { role: 'user', content: message },
      { role: 'assistant', content: memoryContext }, // Include memory context
      { role: 'user', content: `User: ${username}` } // Add the current user's username
    ];

    try {
      const text = await provider.chatCompletion(messages, options);
      console.log(text);

      // Store memory
      memories.push({ user: username, message: message, response: text });
      fs.writeFileSync('memories.json', JSON.stringify(memories, null, 2));

      // Check for follow command
      const followMatch = text.match(/\[follow @(\w+)\]/);
      if (followMatch) {
        const targetUsername = followMatch[1];
        followPlayer(targetUsername);
      } else if (text.includes("[stop following]")) {
        stopFollowing();
      } else if (text.includes("[go to block]")) {
        goToBlock(username); // Call the function to go to the block
      } else if (text.includes("follow me")) {
        // Let AI handle asking for the username
        const aiMessage = await provider.chatCompletion([{ role: 'user', content: `Sure, what is your username?` }], options);
        bot.chat(aiMessage); // Send the AI message
      } else {
        // Send AI response
        bot.chat(text);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  });

  // Function to follow a player
  async function followPlayer(username) {
    followingPlayer = username; // Set the player being followed
    const player = bot.players[username];

    if (player) {
      const goal = new goals.GoalFollow(player.entity, 1);
      bot.pathfinder.setGoal(goal);
      
      // Continuously update the goal to follow the player
      bot.on('move', () => {
        if (!followingPlayer || !bot.players[followingPlayer]) {
          bot.pathfinder.stop(); // Stop if the player is not found anymore or stopped following
        } else {
          const playerEntity = bot.players[followingPlayer].entity;
          if (playerEntity) {
            bot.pathfinder.setGoal(new goals.GoalFollow(playerEntity, 1)); // Keep following the player
          }
        }
      });
    } else {
      // AI response for player not found
      const aiMessage = await provider.chatCompletion([{ role: 'user', content: `I can't find the player ${username}.` }], options);
      bot.chat(aiMessage);
    }
  }

  // Function to stop following
  function stopFollowing() {
    if (followingPlayer) {
      bot.pathfinder.stop(); // Stop the bot's movement
      bot.chat(`[stop following]`); // AI response indicating stop following
      followingPlayer = null; // Clear the following player
    }
  }

  // Function to go to the block the player is looking at
  async function goToBlock(username) {
    const player = bot.players[username]?.entity;
    if (player && player.direction) {
      // Raycast to find the block the player is looking at
      const targetPosition = player.position.offset(0, player.height, 0).add(player.direction.scaled(5));
      const targetBlock = bot.blockAt(targetPosition);

      if (targetBlock) {
        const goal = new goals.GoalBlock(targetBlock.position);
        bot.pathfinder.setGoal(goal);
        bot.chat(`[go to block]`); // AI response indicating the action
      } else {
        const aiMessage = await provider.chatCompletion([{ role: 'user', content: `I can't find the block you're looking at.` }], options);
        bot.chat(aiMessage);
      }
    } else {
      const aiMessage = await provider.chatCompletion([{ role: 'user', content: `I can't determine your direction.` }], options);
      bot.chat(aiMessage);
    }
  }
})();

bot.on('error', (err) => console.log(err));
bot.on('end', () => console.log('Bot has disconnected.'));
