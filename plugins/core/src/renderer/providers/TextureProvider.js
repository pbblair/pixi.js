import Signal from 'mini-signals';
import Renderer from '../Renderer';
import Provider from '../Provider';
import { GLTexture, GLConstants } from '@pixi/gl';
import { removeItems } from '../../../../utils';

// @ifdef DEBUG
import { ASSERT } from '@pixi/debug';
// @endif

/**
 * @class
 * @extends Provider
 */
export default class TextureProvider extends Provider
{
    /**
     * @param {Renderer} renderer The renderer this Provider works for.
     */
    constructor(renderer)
    {
        super(renderer);

        const gl = renderer.context.gl;
        const maxTextures = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);

        /**
         * The currently bound textures.
         *
         * @member {GLProgram[]}
         */
        this.boundTextures = new Array(maxTextures);

        /**
         * Empty texture instances by texture target.
         *
         * @member {Object<number,GLProgram>}
         */
        this.emptyTexture = new GLTexture(this.renderer.context.gl);

        /**
         * Textures managed by this provider.
         *
         * @member {GLProgram[]}
         */
        this.managedTextures = [];

        /**
         * Current texture location we are using.
         *
         * @member {number}
         */
        this.currentLocation = -1;

        this.resetTextureCube();
    }

    /**
     * Sets up the renderer context and necessary buffers.
     *
     * @private
     */
    resetTextureCube()
    {
        const gl = this.renderer.context.gl;

        this.emptyTexture.bind(gl.TEXTURE_CUBE_MAP);

        const uploadOptions = {
            target: gl.TEXTURE_CUBE_MAP_POSITIVE_X,
            format: gl.RGBA,
            type: gl.UNSIGNED_BYTE,
            width: 1,
            height: 1,
        };

        for (
            let target = gl.TEXTURE_CUBE_MAP_POSITIVE_X;
            target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z;
            ++target
        )
        {
            uploadOptions.target = target;
            this.emptyTexture.uploadData(null, uploadOptions);
        }
    }

    bind(texture, location)
    {

        const gl = this.gl;


        location = location || 0;

        if(this.currentLocation !== location)
        {
            this.currentLocation = location;
            gl.activeTexture(gl.TEXTURE0 + location);
        }

        if(texture)
        {
            texture = texture.baseTexture || texture;

            if(texture.valid)
            {

                const glTexture = texture._glTextures[this.CONTEXT_UID] || this.initTexture(texture);
                gl.bindTexture(texture.target, glTexture.texture);

                if(glTexture.dirtyId !== texture.dirtyId)
                {
                    glTexture.dirtyId = texture.dirtyId;
                    this.updateTexture(texture);
                }

                this.boundTextures[location] = texture;
            }
        }
        else
        {
            gl.bindTexture(gl.TEXTURE_2D, this.emptyTextures[gl.TEXTURE_2D].texture);
            this.boundTextures[location] = null;
        }
    }

    unbind(texture)
    {
        const gl = this.gl;

        for (var i = 0; i <  this.boundTextures.length; i++) {

            if(this.boundTextures[i] === texture)
            {
                if(this.currentLocation !== i)
                {
                    gl.activeTexture(gl.TEXTURE0 + i);
                    this.currentLocation = i;
                }

                gl.bindTexture(gl.TEXTURE_2D, this.emptyTextures[texture.target].texture);
                this.boundTextures[i] = null;
            }
        }
    }

    initTexture(texture)
    {
        const gl = this.gl;

        var glTexture = new GLTexture(this.gl, -1, -1, texture.format, texture.type);
        glTexture.premultiplyAlpha = texture.premultiplyAlpha;
        // guarentee an update..
        glTexture.dirtyId = -1;

        texture._glTextures[this.CONTEXT_UID] = glTexture;

        this.managedTextures.push(texture);
        texture.on('dispose', this.destroyTexture, this);

        return glTexture;
    }

    updateTexture(texture)
    {
        const glTexture = texture._glTextures[this.CONTEXT_UID];
        const gl = this.gl;

        // TODO there are only 3 textures as far as im aware?
        // Cube / 2D and later 3d. (the latter is WebGL2, we will get to that soon!)
        if(texture.target === gl.TEXTURE_CUBE_MAP)
        {
           // console.log( gl.UNSIGNED_BYTE)
            for (var i = 0; i < texture.sides.length; i++)
            {
                // TODO - we should only upload what changed..
                // but im sure this is not  going to be a problem just yet!
                var texturePart = texture.sides[i];

                if(texturePart.resource)
                {
                    if(texturePart.resource.uploadable)
                    {

                        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + texturePart.side,
                                      0,
                                      texture.format,
                                      texture.format,
                                      texture.type,
                                      texturePart.resource.source);
                    }
                    else
                    {
                        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + texturePart.side,
                                  0,
                                  texture.format,
                                  texture.width,
                                  texture.height,
                                  0,
                                  texture.format,
                                  texture.type,
                                  texturePart.resource.source);
                    }
                }
                else
                {
                    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + texturePart.side,
                                  0,
                                  texture.format,
                                  texture.width,
                                  texture.height,
                                  0,
                                  texture.format,
                                  texture.type,
                                  null);
                }
            }
        }
        if(texture.target === gl.TEXTURE_2D_ARRAY)
        {
            console.log("REMEMBER THIS IS TOO MANY!")
            gl.texImage3D(gl.TEXTURE_2D_ARRAY,
                              0,
                              texture.format,
                              texture.width,
                              texture.height,
                              6,
                              0,
                              texture.format,
                              texture.type,
                              null);

            for (var i = 0; i < texture.array.length; i++)
            {
                // TODO - we should only upload what changed..
                // but im sure this is not  going to be a problem just yet!
                var texturePart = texture.array[i];

                if(texturePart.resource)
                {
                  //  void gl.texSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, ImageBitmap? pixels);
                    console.log(texturePart.resource.source)

                    if(texturePart.resource.loaded)
                    {
                        console.log("UPOAD..")
                        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,
                                  0,
                                  0,//xoffset
                                  0,//yoffset
                                  i,//zoffset
                                  texturePart.resource.width,
                                  texturePart.resource.height,
                                  1,
                                  texture.format,
                                  texture.type,
                                  texturePart.resource.source);
                    }

                }
                else
                {


                }
            }
        }
        else
        {
            if(texture.resource)
            {
                // TODO (cengler): uploadable was only false for BufferResource.
                // instead just check `isDataResource` which is true for array buffers.
                // Also, change `resource.source` -> `resource.data`.
                if(texture.resource.uploadable)
                {
                    glTexture.upload(texture.resource.source);

                }
                else
                {
                    glTexture.uploadData(texture.resource.source, texture.width, texture.height);
                }
            }
            else
            {
                glTexture.uploadData(null, texture.width, texture.height);
            }
        }

        // lets only update what changes..
        this.setStyle(texture);
    }

    /**
     * Deletes the texture from WebGL
     *
     * @param {PIXI.BaseTexture|PIXI.Texture} texture - the texture to destroy
     * @param {boolean} [skipRemove=false] - Whether to skip removing the texture from the TextureManager.
     */
    destroyTexture(texture, skipRemove)
    {
        texture = texture.baseTexture || texture;

        if (texture._glTextures[this.renderer.CONTEXT_UID])
        {
            this.unbind(texture);

            texture._glTextures[this.renderer.CONTEXT_UID].destroy();
            texture.off('dispose', this.destroyTexture, this);

            delete texture._glTextures[this.renderer.CONTEXT_UID];

            if (!skipRemove)
            {
                const i = this.managedTextures.indexOf(texture);

                if (i !== -1)
                {
                    removeItems(this.managedTextures, i, 1);
                }
            }
        }
    }

    setStyle(texture)
    {
        const gl = this.gl;

        gl.texParameteri(texture.target, gl.TEXTURE_WRAP_S, texture.wrapMode);
        gl.texParameteri(texture.target, gl.TEXTURE_WRAP_T, texture.wrapMode);

        if(texture.mipmap)
        {
            gl.texParameteri(texture.target, gl.TEXTURE_MIN_FILTER, texture.scaleMode ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST);
        }
        else
        {
            gl.texParameteri(texture.target, gl.TEXTURE_MIN_FILTER, texture.scaleMode ? gl.LINEAR : gl.NEAREST);
        }

        gl.texParameteri(texture.target, gl.TEXTURE_MAG_FILTER, texture.scaleMode ? gl.LINEAR : gl.NEAREST);
    }
}

Renderer.addDefaultProvider(TextureProvider, 'texture');