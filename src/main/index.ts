import { app } from 'electron'
import { createApplication } from './bootstrap/create-application'

app.whenReady().then(createApplication)
