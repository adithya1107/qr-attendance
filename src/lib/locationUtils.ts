export interface Location {
  latitude: number
  longitude: number
}

/**
 * Get the current GPS location of the device
 */
export const getCurrentLocation = (): Promise<Location> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'))
      return
    }

    const ACCEPTABLE_ACCURACY = 30
    const MAX_WAIT_TIME = 15000
    const startTime = Date.now()
    let bestPosition: GeolocationPosition | null = null
    let watchId: number

    const checkPosition = (pos: GeolocationPosition) => {
      const elapsed = Date.now() - startTime

      if (!bestPosition || pos.coords.accuracy < bestPosition.coords.accuracy) {
        bestPosition = pos
      }

      if (pos.coords.accuracy <= ACCEPTABLE_ACCURACY || elapsed >= MAX_WAIT_TIME) {
        navigator.geolocation.clearWatch(watchId)
        resolve({
          latitude: (bestPosition || pos).coords.latitude,
          longitude: (bestPosition || pos).coords.longitude,
        })
      }
    }

    const handleError = (error: GeolocationPositionError) => {
      navigator.geolocation.clearWatch(watchId)
      switch (error.code) {
        case error.PERMISSION_DENIED:
          reject(new Error('Location permission denied. Please enable location access.'))
          break
        case error.POSITION_UNAVAILABLE:
          reject(new Error('Location information is unavailable.'))
          break
        case error.TIMEOUT:
          reject(new Error('Location request timed out.'))
          break
        default:
          reject(new Error('An unknown error occurred getting location.'))
      }
    }

    watchId = navigator.geolocation.watchPosition(checkPosition, handleError, {
      enableHighAccuracy: true,
      timeout: MAX_WAIT_TIME,
      maximumAge: 0,
    })
  })
}

/**
 * Calculate the distance (in meters) between two coordinates using the Haversine formula
 */
export const calculateDistance = (loc1: Location, loc2: Location): number => {
  const R = 6371000 // Earth radius in meters
  const φ1 = (loc1.latitude * Math.PI) / 180
  const φ2 = (loc2.latitude * Math.PI) / 180
  const Δφ = ((loc2.latitude - loc1.latitude) * Math.PI) / 180
  const Δλ = ((loc2.longitude - loc1.longitude) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Check if a student location is within the allowed radius of the teacher
 */
export const isWithinRadius = (
  teacherLocation: Location,
  studentLocation: Location,
  studentAccuracyMeters = 50
): { allowed: boolean; distance: number; radius: number } => {
  const distance = calculateDistance(teacherLocation, studentLocation)
  const teacherAccuracy = 20
  const combinedAccuracy = Math.sqrt(
    teacherAccuracy * teacherAccuracy + studentAccuracyMeters * studentAccuracyMeters
  )
  const radius = Math.min(15 + combinedAccuracy + 10, 100)

  return {
    allowed: distance <= radius,
    distance,
    radius,
  }
}
