# The Last Frontier: design notes

A sci-fi Western extraction roguelike. You hire a drifter in the town of Mercy, ride out on a story chapter or a job, take what you can carry, and get back before dark. Death ends a drifter but not the campaign.

## Setting

The frontier is a canyon territory that the Meridian Company is surveying with machines. Outlaws are people. The company fields robots: sentry units, scouts on two legs, and the Foreman, a boiler-plated boss. The Hollow, under the mine, keeps its dead walking. Mercy has taken in a few rebuilt machines of its own: Unit E-7 runs the telegraph, and Deputy Tin can be rebuilt at the Town Hall.

## The loop

1. **Mercy** is a walkable town. Each building is a shop with a keeper at a counter: General Store (supplies), Gunsmith (guns and upgrades), Outfitter (gear), Clinic, Telegraph, Saloon (job board), Town Hall (story and investments), Livery. Boot Hill holds the drifters you have lost.
2. **Ride** a generated level: canyon maps with points of interest joined by trails, or the mine with rooms and tunnels. Levels come from a spec and a seed and are regenerated until `validateLevel` finds nothing unreachable.
3. **Decide**. What you pick up is unsecured. The sun sets on a clock; after dark, vision shrinks and Hollow walkers hunt.
4. **Extract** at a horse, coach, lift or ladder.
5. **Settle** exactly once: pay, story progress and the town's prosperity.

## Story

Six chapters, played in order, each with its own level spec: the missing shipment, the courier, Site 9 (with a choice about the ledger), the Calloway mine, the Hollow, and the Foreman. Jobs from the saloon board repeat between chapters for cash.

## Death and what persists

A dead drifter is buried with their kit and carried items. Cash, guns, gun upgrades, town investments and story progress stay with the campaign. A drifter killed by a person leaves a bounty who carries their gear.

## Camera and controls

One camera: third person, over the right shoulder, rising over walls when squeezed. Aiming is a ray from the crosshair. Pointer lock is used when the host allows it; otherwise the camera turns at the screen edges. A click while the lock request is still pending counts as a shot. Touch has a stick, a look pad and buttons.

## Guns

Three player guns share two ammo pools: revolver (6 rounds, fan fire), repeater (12 rounds), coach gun (6 shells, double blast). Upgrades fit at the gunsmith once the workshop is funded.

## Deputy Tin

A town investment, so it survives the drifter. It heels at the drifter's left, away from the camera and the gun, shoots at enemies that are already fighting, and never draws aggro. Stray enemy bullets can knock it offline for 14 seconds. It is deliberately weak (7 damage a shot) so that it covers you without playing the game for you.

## Art

Everything is vertex-coloured low-poly with no textures. The world is Kenney kits. Characters are Quaternius packs on their own skeletons with their packaged animations. Two styles of people are mixed: realistic proportions for most, and a big-headed cartoon pack for the cowboys, the doctor and the zombies, because that pack has the only cowboy models. The cartoon pack draws skin as a black silhouette; the bake gives it a skin tone so it sits with the others.

## Known limits

- Guns are fitted to the hand in the aiming pose only, so in other poses a gun can point up or sideways.
- Hats on the realistic models are generated shapes on the head bone, not modelled hats.
- The scout robot has no arms, so it shows no gun.
- The asset download is about 14 MB.
