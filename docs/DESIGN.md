# The Last Frontier: design notes

A sci-fi Western extraction roguelike. You hire a drifter in the town of Mercy, ride out on a story chapter or a job, take what you can carry, and get back before dark. Death ends a drifter but not the campaign.

## Setting

Forty years ago a ship fell out of the sky and buried itself in the Red Country. The Meridian Company sank the Calloway mine onto it and builds machines from the wreck: sentry units, scout walkers, enforcers, crushers. The machines do not think; they take orders from signal relays that listen to the ship. The miners the company sealed in are still walking down there (the Hollow). Outlaws are people. Mercy is the last free town, and has rebuilt a few machines of its own: Unit E-7 runs the telegraph and Deputy Tin can be rebuilt at the Town Hall.

## The loop

1. **Mercy** is a walkable town. Each building is a shop with a keeper at a counter: General Store (supplies), Gunsmith (guns and upgrades), Outfitter (gear), Clinic, Telegraph, Saloon (job board), Town Hall (story and investments), Livery. Boot Hill holds the drifters you have lost.
2. **Ride** a generated level: canyon maps with points of interest joined by trails, or the mine with rooms and tunnels. Levels come from a spec and a seed and are regenerated until `validateLevel` finds nothing unreachable.
3. **Decide**. What you pick up is unsecured. The sun sets on a clock; after dark, vision shrinks and Hollow walkers hunt.
4. **Extract** at a horse, coach, lift or ladder.
5. **Settle** exactly once: pay, story progress and the town's prosperity.

## Story

A prologue on the hiring screen sets the premise. Eight chapters are played in order, each with its own level spec:

1. The Missing Shipment: a strongbox that holds a machine core.
2. The Courier's Road: a map to Site 9, and the first machines.
3. Fences in the Desert: the Site 9 ledger, and a choice about who reads it.
4. Cut the Strings: overload three signal relays. Unlocks energy weapons.
5. The Calloway Mine: the bore key.
6. What They Dug Up: the engine shard from the ship's heart.
7. The Foundry: destroy the Overseer.
8. The Foreman.

Every chapter has a one-line `goal` shown in town and a `recap` for the journal (J), which always says what has happened and what to do next. Jobs from the saloon board repeat between chapters for cash.

## Death and what persists

A dead drifter is buried with their kit and carried items. Cash, guns, gun upgrades, town investments and story progress stay with the campaign. A drifter killed by a person leaves a bounty who carries their gear.

## Camera and controls

One camera: third person, over the right shoulder, rising over walls when squeezed. Aiming is a ray from the crosshair. Pointer lock is used when the host allows it; otherwise the camera turns at the screen edges. A click while the lock request is still pending counts as a shot. Touch has a stick, a look pad and buttons.

## Guns

Each gun is meant to play differently, not just to have bigger numbers.

| Gun | What makes it different |
|---|---|
| Revolver | Free sidearm. Six rounds loaded singly. Alternate fire fans the whole cylinder. |
| Repeater | Accurate at long range, slow to cycle. |
| Coach gun | Eight pellets, short range. Alternate fire is both barrels. |
| Rattler | Thirty rounds, very fast, inaccurate. The whole magazine swaps at once. |
| Long Tom | Four huge rounds that pierce three targets. Very slow. After chapter 2. |
| Pulse carbine | No ammunition: the cell recharges when you stop firing. +60% to machines. Alternate fire spends half the cell on one piercing bolt. After chapter 4. |
| Arc caster | Lightning that jumps to two more enemies and locks machines up. After chapter 6. |

Number keys pick the nth gun you own. Upgrades fit at the gunsmith once the workshop is funded.

## Machines

Enemies flagged `robot` take extra damage from energy weapons and are stunned by the arc caster and by a relay overloading nearby. Bosses cannot be stunned. Only people become bounties that carry off a dead drifter's kit.

## Deputy Tin

A town investment, so it survives the drifter. It heels at the drifter's left, away from the camera and the gun, shoots at enemies that are already fighting, and never draws aggro. Stray enemy bullets can knock it offline for 14 seconds. It is deliberately weak (7 damage a shot) so that it covers you without playing the game for you.

## Art

Everything is vertex-coloured low-poly with no textures. The world is Kenney kits. Characters are Quaternius packs on their own skeletons with their packaged animations. Only models that suit the setting are baked: adventurers, farmers, a trooper, a space suit, a soldier, robots, and from the cartoon pack the cowboys, old-west townsfolk, the doctor and the zombies. Clothing is recoloured in code for variety. The cartoon pack draws skin as a black silhouette; the bake gives it a skin tone so it sits with the others.

## Known limits

- While a gun is drawn the arms are held in the aiming pose and only the legs and body animate, so the gun always points forward. Recoil is a short kick of the gun itself.
- Hats on the realistic models are generated shapes on the head bone, not modelled hats.
- The scout robot has no arms, so it shows no gun.
- The asset download is about 14 MB.
