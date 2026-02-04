---
inclusion: always
---
<!------------------------------------------------------------------------------------
   Add rules to this file or a short description and have Kiro refine them for you.
   
   Learn about inclusion modes: https://kiro.dev/docs/steering/#inclusion-modes
-------------------------------------------------------------------------------------> 

- must use `npm` scripts for all actions: build, test, lint, lint:fix.
- DO NOT add command line arguments - just run the tools we have defined that is why they are there.
- When running tests - all error sand warnings must resolved no matter WHO caused the error.