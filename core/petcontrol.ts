// /walkman pet [on|off]: start, stop and ask after the desktop pet (cloud-f1/walkman-pet, installed as "Walkman Pet").
// Pure: the hook runs the commands. macOS only for now. The Mod never starts or stops the pet by itself; only these
// three words typed by the person do.
export const PET_APP = 'Walkman Pet'
export const PET_PROCESS = 'walkman-pet' // the name of the app's own process, as pkill and pgrep see it

export type PetAction = 'on' | 'off' | 'status'

export const PET_ARGV: Record<PetAction, string[]> = {
  on: ['open', '-a', PET_APP],
  off: ['pkill', '-x', PET_PROCESS],
  status: ['pgrep', '-x', PET_PROCESS],
}

// No word is "is it running?"; anything but on, off or nothing is not a command.
export function parsePetAction(arg: string | undefined): PetAction | undefined {
  if (arg === undefined || arg === '') return 'status'
  return arg === 'on' || arg === 'off' ? arg : undefined
}

export const PET_USAGE = 'Usage: /walkman pet (is it running?), /walkman pet on, /walkman pet off'

const BUILD_HINT = `${PET_APP} is not installed (macOS did not find it). Build it in cloud-f1/walkman-pet with "npm run build:mac", then drag the app into Applications.`

// What the person is told. `run` is the command's exit code, or nothing when it could not be run at all.
export function petReply(action: PetAction, run: { exitCode: number } | undefined, onMac: boolean): string {
  if (!onMac) return 'The desktop pet runs on macOS only for now.'
  if (!run) return `Could not run that here (${PET_ARGV[action][0]} is not available).`
  if (action === 'status') return run.exitCode === 0 ? 'The desktop pet is running.' : 'The desktop pet is not running. /walkman pet on starts it.'
  if (action === 'on') return run.exitCode === 0 ? 'The desktop pet is on. Click it to bring a terminal forward; right-click for the menu.' : BUILD_HINT
  if (run.exitCode === 0) return 'The desktop pet is off.'
  return run.exitCode === 1 ? 'The desktop pet was not running.' : `Could not stop the desktop pet (exit ${run.exitCode}).`
}
