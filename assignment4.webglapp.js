'use strict'

import Quad from './assignment4.quad.js'
import FrameBufferObject from './assignment4.fbo.js'

import * as mat4 from './js/lib/glmatrix/mat4.js'
import * as vec3 from './js/lib/glmatrix/vec3.js'
import { OrthoCamera, PerspectiveCamera } from './js/utils/camera.js'
import WebGlApp from './js/app/webglapp.js'

/**
 * @Class
 * WebGlApp that will call basic GL functions, manage a list of shapes, and take care of rendering them
 * 
 * This class will use the Shapes that you have implemented to store and render them
 */
class RenderPasses extends WebGlApp 
{
    /**
     * Initializes the app with a box, and the model, view, and projection matrices
     * 
     * @param {WebGL2RenderingContext} gl The webgl2 rendering context
     * @param {Map<String,Shader>} shader The shaders to be used to draw the object
     * @param {AppState} app_state The state of the UI
     */
    constructor( gl, shaders )
    {
        super( gl, shaders )

        // Create a screen quad instance
        this.quad = new Quad( gl, this.quad_shader )

        // Create a framebuffer object
        this.fbo_pixel_filter = new FrameBufferObject(gl)
        this.fbo_directional = new FrameBufferObject(gl)
        this.fbo_point = new FrameBufferObject(gl)

        this.fbo_directional.resize( gl, 1024, 1024 )
        this.fbo_point.resize( gl, 1024, 1024 )

        this.fbo_preview = false
        this.fbo = this.fbo_pixel_filter
    }

    renderpass_normal( gl, canvas_width, canvas_height, excludes = null )
    {
        this.scene.setShader(gl, this.shaders[this.active_shader])

        // Set viewport and clear canvas
        this.setViewport( gl, canvas_width, canvas_height )
        this.clearCanvas( gl )
        this.scene.render( gl, excludes )
    }

    renderpass_pixel_filter( gl, canvas_width, canvas_height )
    {
        // TODO First rendering pass
        this.fbo.resize(gl, canvas_width, canvas_height)
        this.fbo.bindFramebuffer(gl)
        this.renderpass_normal(gl, canvas_width, canvas_height, [ 'light' ])
        this.fbo.unbindFramebuffer(gl)


        // TODO Second rendering pass
        this.quad.render(gl, this.filter_mode, this.fbo.getColorTexture(), this.fbo.getDepthTexture())

        // render only lights
        this.scene.render( gl, [ 'model' ] )
    }

    do_depth_pass( gl, fbo, current_light )
    {
        // compute the scale of the corrent scene
        let scale = mat4.getScaling(vec3.create(), this.scene.scenegraph.transformation)

        // TODO compute camera matrices from 
        let shadow_v
        let shadow_p

        // TODO first rendering pass
        {
            let shadow_camera = current_light.getCamera( scale )
            shadow_v = shadow_camera.getViewMatrix()
            shadow_p = shadow_camera.getProjectionMatrix()

            let shader = this.shaders[this.active_shader]

            {
                // TODO configure shader parameters
                // Include u_eye to avoid specular reflection in preview
                shader.use( )
                shader.setUniform3f('u_eye', shadow_camera.getEye())
                shader.setUniform4x4f('u_v', shadow_v)
                shader.setUniform4x4f('u_p', shadow_p)
                shader.unuse( )
            }

            fbo.resize(gl, fbo.width, fbo.height)
            fbo.bindFramebuffer(gl)
            this.renderpass_normal(gl, fbo.width, fbo.height, [ 'light' ])
            fbo.unbindFramebuffer(gl)

            {
                // TODO restore shader parameters
                shader.use( )
                shader.setUniform3f('u_eye', this.camera.getEye())
                shader.setUniform4x4f('u_v', this.camera.getViewMatrix())
                shader.setUniform4x4f('u_p', this.camera.getProjectionMatrix())
                shader.unuse( )
            }
        }
        // Return p * v for shadows
        return mat4.multiply(mat4.create(), shadow_p, shadow_v)
    }

    renderpass_shadowmap( gl, canvas_width, canvas_height )
    {
        // compute the light-camera matrices for both lights
        let u_shadow_pv_directional = mat4.identity(mat4.create())
        let u_shadow_pv_point = mat4.identity(mat4.create())
        if (this.first_directional_light) {
            u_shadow_pv_directional = 
                this.do_depth_pass( gl, this.fbo_directional, this.first_directional_light )
        }
        if (this.first_point_light) {
            u_shadow_pv_point = 
                this.do_depth_pass( gl, this.fbo_point, this.first_point_light )
        }

        this.setViewport( gl, canvas_width, canvas_height )
        this.clearCanvas( gl )  

        // TODO final rendering pass
        {
            this.scene.setShader(gl, this.shadow_shader)
            {
                let shader = this.shadow_shader
                shader.use()

                // TODO First, restore camera position
                shader.setUniform3f('u_eye', this.camera.getEye())
                shader.setUniform4x4f('u_v', this.camera.getViewMatrix())
                shader.setUniform4x4f('u_p', this.camera.getProjectionMatrix())

                // TODO Second, pass-in light-camera matrices
                shader.setUniform4x4f('u_shadow_pv_point', u_shadow_pv_point)
                shader.setUniform4x4f('u_shadow_pv_directional', u_shadow_pv_directional)

                // Use textures 3 and 4 since 0-2 are already used

                // TODO Activate the depth texture for the point light
                this.fbo = this.fbo_point
                shader.setUniform1i('u_shadow_tex_point', 4)
                gl.activeTexture(gl.TEXTURE4)
                gl.bindTexture(gl.TEXTURE_2D, this.fbo.getDepthTexture())

                // TODO Activate the depth texture for the directional light
                this.fbo = this.fbo_directional
                shader.setUniform1i('u_shadow_tex_directional', 3)
                gl.activeTexture(gl.TEXTURE3)
                gl.bindTexture(gl.TEXTURE_2D, this.fbo.getDepthTexture())

                shader.unuse()
            }

            // TODO render the scene normally without lights
            this.scene.render( gl, [ 'light' ] )

            // Finally render the annotation of lights
            if (this.first_directional_light) this.first_directional_light.render( gl )
            if (this.first_point_light) this.first_point_light.render( gl )

            // Unbind textures
            gl.activeTexture(gl.TEXTURE3)
            gl.bindTexture(gl.TEXTURE_2D, null)
            gl.activeTexture(gl.TEXTURE4)
            gl.bindTexture(gl.TEXTURE_2D, null)
        }
    }
}

export default RenderPasses
