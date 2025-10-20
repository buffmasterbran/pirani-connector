import { format } from 'date-fns'

export function safeFormatDate(dateString: string, formatString: string = 'MMM dd, yyyy'): string {
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return dateString || 'N/A'
    }
    return format(date, formatString)
  } catch (error) {
    return dateString || 'N/A'
  }
}

export function safeToLocaleDateString(dateString: string): string {
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return dateString || 'N/A'
    }
    return date.toLocaleDateString()
  } catch (error) {
    return dateString || 'N/A'
  }
}
