# Test Cases

## Script Content Changes

1. Changing Render Component References

   - If the import path is incorrect

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/Helloworld.tsx'; // resolveId error.
   </script>

   <HelloWorld />
   ```

   - If the component name is changed

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorldChanged from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

2. Adding New Render Component References

   - If the import path is incorrect.

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
     import Hello from './react/HelloErrorPath.tsx';
   </script>

   <HelloWorld />
   <Hello />
   ```

   - If the render component is not used by any render container.

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
     import Hello from './react/Hello.tsx';
   </script>

   <HelloWorld />
   ```

   - If the render component is used by a render container (ssr:only only).

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
     import Hello from './react/Hello.tsx';
   </script>

   <HelloWorld />
   <Hello ssr:only />
   <Hello ssr:only />
   ```

   - If the render component is used by a render container (including client:\*).

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
     import Hello from './react/Hello.tsx';
   </script>

   <HelloWorld />
   <Hello ssr:only />
   <Hello client:only />
   ```

3. Removing Render Component References

   - If the removed render component is not used by any render container.

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
     import Hello from './react/Hello.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   - If the removed render component is used by a render container (ssr:only only).

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
     import Hello from './react/Hello.tsx';
   </script>

   <HelloWorld />
   <Hello ssr:only />
   <Hello ssr:only />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   - If the removed render component is used by a render container (including client:\*).

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
     import Hello from './react/Hello.tsx';
   </script>

   <HelloWorld />
   <Hello ssr:only />
   <Hello client:only />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

## Render Container Content Changes

1. Modifying Render Container Attributes

   - The render directive of the render container is changed from client\* to ssr:only, and the relationship between the render container and the render component is one-to-one.

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld client:only />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld ssr:only />
   ```

   - The render directive of the render container is changed from ssr:only to client:\*, and the relationship between the render container and the render component is one-to-one.

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld ssr:only />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld client:only />
   ```

   - The render directive of the render container is changed from client\* to ssr:only, and the relationship between the render container and the render component is many-to-one (including other client:\* render directives).

   ```md [Original Content]
   <script lang="react">
    import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld client:only />
   <HelloWorld client:only />
   <HelloWorld client:load />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld ssr:only />
   <HelloWorld client:only />
   <HelloWorld client:load />
   ```

   - The render directive of the render container is changed from ssr:only to client:\*, and the relationship between the render container and the render component is many-to-one (including only ssr:only render directives).

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld ssr:only />
   <HelloWorld />
   <HelloWorld ssr:only />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld client:only />
   <HelloWorld />
   <HelloWorld ssr:only />
   ```

2. Adding a New Render Container

   - The new render container has no corresponding render component.

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   <Hello />
   ```

   - The relationship between the new render container and the render component is one-to-one, and the render container is ssr:only.

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
     import Hello from './react/Hello.tsx';
   </script>

   <HelloWorld />
   <Hello ssr:only />
   ```

   - The relationship between the new render container and the render component is one-to-one, and the render container is client:\*.

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
     import Hello from './react/Hello.tsx';
   </script>

   <HelloWorld />
   <Hello client:only />
   ```

   - The relationship between the new render container and the render component is many-to-one, and the render container includes both ssr:only and client:\*.

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
     import Hello from './react/Hello.tsx';
   </script>

   <HelloWorld />
   <Hello ssr:only />
   <Hello client:only />
   ```

3. Removing a Render Container

   - If the removed render container is the only render container for its corresponding render component, and the render container is ssr:only.

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld ssr:only />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>
   ```

   - If the removed render container is the only render container for its corresponding render component, and the render container includes client:\*.

   ```md [Original Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld client:only />
   ```

   ```md [Modified Content]
   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>
   ```

## Markdown Content Changes Not Related to the Feature

1. Whether the changed Markdown content renders correctly and triggers feature HMR.

   **Expected behavior**: The changed Markdown renders correctly but does not trigger feature HMR.

   ```md [Original Content]
   # Hello World

   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

   ```md [Modified Content]
   # Hello World!

   <script lang="react">
     import HelloWorld from './react/HelloWorld.tsx';
   </script>

   <HelloWorld />
   ```

2. Whether the changed Markdown content causes the render container state to be lost.

**Expected behavior**: The changed Markdown renders correctly and does not cause the render container state to be lost.

````md [Original Content]
# Hello World

  <script lang="react">
    import HelloWorld from './react/HelloWorld.tsx';
  </script>

  <HelloWorld />
  ```

```md [Modified Content]
# Hello World!

<script lang="react">
  import HelloWorld from './react/HelloWorld.tsx';
</script>

<HelloWorld />
```
````
